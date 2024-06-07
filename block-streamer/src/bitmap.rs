use anyhow::anyhow;
use base64::{engine::general_purpose, Engine as _};
use std::convert::TryFrom;

use crate::graphql::client::{get_bitmaps_exact, get_bitmaps_wildcard};

#[derive(Debug, Default, PartialEq)]
pub struct Base64Bitmap {
    pub start_block_height: usize,
    pub base64: String,
}

impl Base64Bitmap {
    pub fn from_exact_query(
        query_item: &get_bitmaps_exact::GetBitmapsExactDarunrsNearBitmapV5ActionsIndex,
    ) -> Self {
        Self {
            base64: query_item.bitmap.clone(),
            start_block_height: usize::try_from(query_item.first_block_height).unwrap(),
        }
    }

    pub fn from_wildcard_query(
        query_item: &get_bitmaps_wildcard::GetBitmapsWildcardDarunrsNearBitmapV5ActionsIndex,
    ) -> Self {
        Self {
            base64: query_item.bitmap.clone(),
            start_block_height: usize::try_from(query_item.first_block_height).unwrap(),
        }
    }
}

#[derive(Debug, Default, PartialEq)]
pub struct Bitmap {
    pub start_block_height: usize,
    pub bitmap: Vec<u8>,
}

#[derive(Default)]
struct EliasGammaDecoded {
    pub value: usize,
    pub last_bit_index: usize,
}

#[cfg(not(test))]
pub use BitmapOperatorImpl as BitmapOperator;
#[cfg(test)]
pub use MockBitmapOperatorImpl as BitmapOperator;

pub struct BitmapOperatorImpl {}

#[cfg_attr(test, mockall::automock)]
impl BitmapOperatorImpl {
    pub fn new() -> Self {
        Self {}
    }

    pub fn get_bit(&self, bytes: &[u8], bit_index: usize) -> bool {
        let byte_index: usize = bit_index / 8;
        let bit_index_in_byte: usize = bit_index % 8;

        (bytes[byte_index] & (1u8 << (7 - bit_index_in_byte))) > 0
    }

    fn set_bit(&self, bytes: &mut [u8], bit_index: usize, bit_value: bool, write_zero: bool) {
        if !bit_value && write_zero {
            bytes[bit_index / 8] &= !(1u8 << (7 - (bit_index % 8)));
        } else if bit_value {
            bytes[bit_index / 8] |= 1u8 << (7 - (bit_index % 8));
        }
    }

    fn read_integer_from_binary(
        &self,
        bytes: &[u8],
        start_bit_index: usize,
        end_bit_index: usize,
    ) -> u32 {
        let mut number: u32 = 0;
        // Read bits from right to left
        for curr_bit_index in (start_bit_index..=end_bit_index).rev() {
            if self.get_bit(bytes, curr_bit_index) {
                number |= 1u32 << (end_bit_index - curr_bit_index);
            }
        }

        number
    }

    fn index_of_first_set_bit(&self, bytes: &[u8], start_bit_index: usize) -> Option<usize> {
        let mut first_bit_index: usize = start_bit_index % 8;
        for (byte_index, byte) in bytes.iter().enumerate().skip(start_bit_index / 8) {
            if *byte > 0 {
                for bit_index in first_bit_index..=7 {
                    if *byte & (1u8 << (7 - bit_index)) > 0 {
                        return Some(byte_index * 8 + bit_index);
                    }
                }
            }
            first_bit_index = 0;
        }

        None
    }

    fn decode_elias_gamma_entry(&self, bytes: &[u8], start_bit_index: usize) -> EliasGammaDecoded {
        if bytes.is_empty() {
            return EliasGammaDecoded::default();
        }
        let first_bit_index = match self.index_of_first_set_bit(bytes, start_bit_index) {
            Some(index) => index,
            None => {
                return EliasGammaDecoded::default();
            }
        };
        let zero_count: usize = first_bit_index - start_bit_index;
        let remainder: usize = if zero_count == 0 {
            0
        } else {
            self.read_integer_from_binary(bytes, first_bit_index + 1, first_bit_index + zero_count)
                .try_into()
                .unwrap()
        };

        EliasGammaDecoded {
            value: 2_usize.pow(zero_count.try_into().unwrap()) + remainder,
            last_bit_index: first_bit_index + zero_count,
        }
    }

    fn decompress_bitmap(&self, compressed_bitmap: &[u8]) -> Vec<u8> {
        let compressed_bit_length: usize = compressed_bitmap.len() * 8;
        let mut current_bit_value: bool = (compressed_bitmap[0] & 0b10000000) > 0;
        let mut decompressed_bytes: Vec<u8> = Vec::new();

        let mut compressed_bit_index = 1;
        let mut decompressed_bit_index = 0;

        while compressed_bit_index < compressed_bit_length {
            let decoded_elias_gamma =
                self.decode_elias_gamma_entry(compressed_bitmap, compressed_bit_index);
            if decoded_elias_gamma.value == 0 {
                break;
            }

            compressed_bit_index = decoded_elias_gamma.last_bit_index + 1;
            let mut bit_index_offset: usize = 0;
            while current_bit_value && (bit_index_offset < decoded_elias_gamma.value) {
                while decompressed_bit_index + bit_index_offset >= (decompressed_bytes.len() * 8) {
                    decompressed_bytes.push(0b00000000);
                }
                self.set_bit(
                    &mut decompressed_bytes,
                    decompressed_bit_index + bit_index_offset,
                    true,
                    true,
                );
                bit_index_offset += 1;
            }

            decompressed_bit_index += decoded_elias_gamma.value;
            current_bit_value = !current_bit_value;
        }

        decompressed_bytes
    }

    fn merge_bitmap(
        &self,
        bitmap_to_update: &mut Bitmap,
        bitmap_to_merge: &Bitmap,
    ) -> anyhow::Result<()> {
        let start_bit_index: usize = match bitmap_to_merge
            .start_block_height
            .checked_sub(bitmap_to_update.start_block_height)
        {
            Some(result) => result,
            None => {
                return Err(anyhow!(
                    "Start block height in bitmap was lower than provided lowest block height",
                ))
            }
        };

        for bit_index_offset in 0..(bitmap_to_merge.bitmap.len() * 8) {
            let decompressed_bit_value = self.get_bit(&bitmap_to_merge.bitmap, bit_index_offset);
            while start_bit_index + bit_index_offset >= bitmap_to_update.bitmap.len() * 8 {
                bitmap_to_update.bitmap.push(0b00000000);
            }

            self.set_bit(
                &mut bitmap_to_update.bitmap,
                start_bit_index + bit_index_offset,
                decompressed_bit_value,
                false,
            );
        }

        Ok(())
    }

    pub fn merge_bitmaps(
        &self,
        bitmaps_to_merge: &Vec<Base64Bitmap>,
        smallest_start_block_height: usize,
    ) -> anyhow::Result<Bitmap> {
        let mut merged_bitmap: Bitmap = Bitmap {
            bitmap: Vec::new(),
            start_block_height: smallest_start_block_height,
        };

        for compressed_base64_bitmap in bitmaps_to_merge {
            let decoded_bitmap: Vec<u8> =
                general_purpose::STANDARD.decode(compressed_base64_bitmap.base64.clone())?;
            let decompressed_bitmap: Bitmap = Bitmap {
                bitmap: self.decompress_bitmap(&decoded_bitmap),
                start_block_height: compressed_base64_bitmap.start_block_height,
            };
            self.merge_bitmap(&mut merged_bitmap, &decompressed_bitmap)?;
        }

        Ok(merged_bitmap)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn get_bit_from_bytes() {
        let operator = BitmapOperatorImpl::new();
        let bytes: &[u8; 3] = &[0b00000001, 0b00000000, 0b00001001];
        let results: Vec<bool> = [7, 8, 9, 15, 19, 20, 22, 23]
            .iter()
            .map(|index| {
                return operator.get_bit(bytes, *index);
            })
            .collect();
        assert_eq!(
            results,
            [true, false, false, false, false, true, false, true]
        );
    }

    #[test]
    fn set_bit_in_bytes() {
        let operator = BitmapOperatorImpl::new();
        let correct_bytes: &[u8; 3] = &[0b00000001, 0b00000000, 0b00001001];
        let test_bytes: &mut [u8; 3] = &mut [0b10000000, 0b10000000, 0b00001001];
        operator.set_bit(test_bytes, 0, false, true);
        operator.set_bit(test_bytes, 7, true, true);
        operator.set_bit(test_bytes, 8, false, true);
        operator.set_bit(test_bytes, 12, false, false);
        assert_eq!(correct_bytes, test_bytes);
    }

    #[test]
    fn get_unsigned_integer_from_binary_sequence() {
        let operator = BitmapOperatorImpl::new();
        let bytes: &[u8; 3] = &[0b11111110, 0b10010100, 0b10001101];
        assert_eq!(operator.read_integer_from_binary(bytes, 6, 16), 1321);
    }

    #[test]
    fn get_index_of_first_set_bit() {
        let operator = BitmapOperatorImpl::new();
        let bytes: &[u8; 4] = &[0b00000001, 0b10000000, 0b00000001, 0b00000000];
        assert_eq!(
            operator.index_of_first_set_bit(bytes, 4).unwrap(),
            7,
            "Should get index 7 when starting from 4",
        );
        assert_eq!(
            operator.index_of_first_set_bit(bytes, 7).unwrap(),
            7,
            "Should get index 7 when starting from 7",
        );
        assert_eq!(
            operator.index_of_first_set_bit(bytes, 8).unwrap(),
            8,
            "Should get index 8 when starting from 8",
        );
        assert_eq!(
            operator.index_of_first_set_bit(bytes, 17).unwrap(),
            23,
            "Should get index 23 when starting from 17",
        );
        assert!(
            operator.index_of_first_set_bit(bytes, 25).is_none(),
            "Should get None when starting from 25",
        );
    }

    #[test]
    fn decode_elias_gamma() {
        let operator = BitmapOperatorImpl::new();
        let bytes: &[u8; 2] = &[0b00000000, 0b00110110];
        let decoded_eg: EliasGammaDecoded = operator.decode_elias_gamma_entry(bytes, 6);
        assert_eq!(decoded_eg.value, 27);
        assert_eq!(decoded_eg.last_bit_index, 14);
    }

    #[test]
    fn decode_empty_elias_gamma() {
        let operator = BitmapOperatorImpl::new();
        let bytes: &[u8; 2] = &[0b00000000, 0b00000000];
        let decoded_eg: EliasGammaDecoded = operator.decode_elias_gamma_entry(bytes, 0);
        assert_eq!(decoded_eg.value, 0);
        assert_eq!(decoded_eg.last_bit_index, 0);
    }

    #[test]
    fn decode_compressed_bitmap() {
        let operator = BitmapOperatorImpl::new();
        assert_eq!(operator.decompress_bitmap(&[0b10100000]), &[0b11000000]);
        assert_eq!(operator.decompress_bitmap(&[0b00100100]), &[0b00110000]);
        assert_eq!(operator.decompress_bitmap(&[0b10010000]), &[0b11110000]);
        assert_eq!(
            operator.decompress_bitmap(&[0b10110010, 0b01000000]),
            &[0b11100001]
        );
        assert_eq!(
            operator.decompress_bitmap(&[0b01010001, 0b01010000]),
            &[0b01100000, 0b11000000]
        );
        assert_eq!(
            operator.decompress_bitmap(&[0b01111111, 0b11111111, 0b11111000]),
            &[0b01010101, 0b01010101, 0b01010000]
        );
        assert_eq!(
            operator.decompress_bitmap(&[0b11010101, 0b11010101, 0b11010100]),
            &[0b10010001, 0b00100010, 0b01000000]
        );
        assert_eq!(
            operator.decompress_bitmap(&[0b00000111, 0b11100000]),
            &[0b00000000, 0b00000000, 0b00000000, 0b00000001]
        );
        assert_eq!(
            operator.decompress_bitmap(&[0b11000001, 0b11011011]),
            &[
                0b10000000, 0b00000000, 0b00000000, 0b00000000, 0b00000000, 0b00000000, 0b00000000,
                0b00001110
            ]
        );
    }

    #[test]
    fn merge_two_decompressed_bitmaps() {
        let operator = BitmapOperatorImpl::new();
        let mut base_bitmap: Bitmap = Bitmap {
            bitmap: vec![0b11001010, 0b10001111],
            start_block_height: 10,
        };
        let compressed_bitmap: Bitmap = Bitmap {
            bitmap: vec![0b11100001], // Decompresses to 11100001
            start_block_height: 14,
        };

        assert!(operator
            .merge_bitmap(&mut base_bitmap, &compressed_bitmap)
            .is_ok());
        assert_eq!(base_bitmap.bitmap, vec![0b11001110, 0b10011111]);
    }

    #[test]
    fn merge_multiple_bitmaps_together() {
        let operator = BitmapOperatorImpl::new();
        let test_bitmaps_to_merge: Vec<Base64Bitmap> = vec![
            Base64Bitmap {
                base64: "oA==".to_string(), // Decompresses to 11000000
                start_block_height: 10,
            },
            Base64Bitmap {
                base64: "oA==".to_string(),
                start_block_height: 14,
            },
            Base64Bitmap {
                base64: "oA==".to_string(),
                start_block_height: 18,
            },
        ];

        let merged_bitmap = operator.merge_bitmaps(&test_bitmaps_to_merge, 10).unwrap();
        assert_eq!(merged_bitmap.bitmap, vec![0b11001100, 0b11000000]);
        assert_eq!(merged_bitmap.start_block_height, 10);
    }
}
