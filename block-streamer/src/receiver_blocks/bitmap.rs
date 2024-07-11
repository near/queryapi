use base64::{engine::general_purpose, Engine as _};
use std::convert::TryFrom;

use crate::graphql::client::{get_bitmaps_exact, get_bitmaps_wildcard};

/// Stores a [`CompressedBitmap`](CompressedBitmap) in Base64 format along with its starting block
/// height
#[derive(Debug, Default, PartialEq)]
pub struct Base64Bitmap {
    pub start_block_height: u64,
    pub base64: String,
}

impl TryFrom<&get_bitmaps_exact::GetBitmapsExactDataplatformNearReceiverBlocksBitmaps>
    for Base64Bitmap
{
    type Error = anyhow::Error;
    fn try_from(
        query_item: &get_bitmaps_exact::GetBitmapsExactDataplatformNearReceiverBlocksBitmaps,
    ) -> anyhow::Result<Self> {
        Ok(Self {
            base64: query_item.bitmap.clone(),
            start_block_height: u64::try_from(query_item.first_block_height)?,
        })
    }
}

impl TryFrom<&get_bitmaps_wildcard::GetBitmapsWildcardDataplatformNearReceiverBlocksBitmaps>
    for Base64Bitmap
{
    type Error = anyhow::Error;
    fn try_from(
        query_item: &get_bitmaps_wildcard::GetBitmapsWildcardDataplatformNearReceiverBlocksBitmaps,
    ) -> anyhow::Result<Self> {
        Ok(Self {
            base64: query_item.bitmap.clone(),
            start_block_height: u64::try_from(query_item.first_block_height)?,
        })
    }
}

/// Stores the decoded value from an Elias Gamma encoded sequence and the index of the last bit
/// that was part of the encoded value
#[derive(Default)]
struct EliasGammaDecoded {
    /// The decoded value obtained from the Elias Gamma encoding. This represents the
    /// length of the run of bits (0s or 1s) in the decompressed bitmap.
    pub value: u64,
    /// The index of the last bit in the compressed bitmap that was part of the
    /// Elias Gamma sequence. Used to determine the starting point for the next sequence.
    pub last_bit_index: usize,
}

/// A struct representing a compressed bitmap using Elias Gamma encoding.
///
/// The `CompressedBitmap` is used to efficiently store sequences of bits where
/// runs of 1s and 0s are encoded to save space, using Elias Gamma encoding which consists of two
/// parts:
/// 1. **Unary Part**:
///    - A sequence of leading zeros (`N`) followed by a `1`.
/// 2. **Binary Part**:
///    - The next `N` bits after the unary part represent binary encoded decimal (remainder).
///
/// The final value is calulated with: 2^N + remainder
///
/// This encoded value determines the number/length of 0s or 1s to be set. The first bit of the
/// compressed bitmap indicates the value of the first run. After processing each
/// Elias Gamma encoded value, the bit value is flipped and the process is repeated for the next
/// segment.
///
/// # Visual Example
///
/// Consider a compressed bitmap `0b00100100`:
///
/// - The first bit is `0`, so the initial run is of 0s.
/// - The first sequence is `010`:
///   - Unary part is `01`, so `N` is `1`
///   - Binary part is `0`, so remainder is `0`
///   - Elias Gamma value: `2^1 + 0 = 2`
///   - This means the first 2 bits of the decompressed bitmap are: `00`
/// - Flip the bit to `1`.
/// - The next sequence `0010`:
///   - Unary part is `010`, so `N` is `0`
///   - Binary part is `0`, so remainder is `0`
///   - Elias Gamma value: `2^1 + 0 = 2`
///   - This means the next 2 bits art `1`s
/// - Flip the bit to `0`.
/// - The last sequence `0`:
///   - Unary part is 0, so N is 0
///   - Binary part is 0, so remainder is 0
///   - Elias Gamma value: `2^0 + 0 = 1`
///   - This means the next bit is `0`.
///
/// The decompressed bitmap would be `0b00110000`.
#[derive(Debug, Default, PartialEq)]
pub struct CompressedBitmap {
    pub start_block_height: u64,
    pub bitmap: Vec<u8>,
}

impl TryFrom<&Base64Bitmap> for CompressedBitmap {
    type Error = anyhow::Error;
    fn try_from(value: &Base64Bitmap) -> anyhow::Result<Self, Self::Error> {
        Ok(Self {
            bitmap: general_purpose::STANDARD.decode(value.base64.clone())?,
            start_block_height: value.start_block_height,
        })
    }
}

impl CompressedBitmap {
    #[cfg(test)]
    pub fn new(start_block_height: u64, bitmap: Vec<u8>) -> Self {
        Self {
            start_block_height,
            bitmap,
        }
    }

    pub fn get_bit(&self, bit_index: usize) -> bool {
        let byte_index: usize = bit_index / 8;
        let bit_index_in_byte: usize = bit_index % 8;

        (self.bitmap[byte_index] & (1u8 << (7 - bit_index_in_byte))) > 0
    }

    fn read_integer_from_binary(&self, start_bit_index: usize, end_bit_index: usize) -> u64 {
        let mut number: u64 = 0;
        // Read bits from right to left
        for curr_bit_index in (start_bit_index..=end_bit_index).rev() {
            if self.get_bit(curr_bit_index) {
                number |= 1u64 << (end_bit_index - curr_bit_index);
            }
        }

        number
    }

    fn index_of_first_set_bit(&self, start_bit_index: usize) -> Option<usize> {
        let mut first_bit_index: usize = start_bit_index % 8;
        for (byte_index, byte) in self.bitmap.iter().enumerate().skip(start_bit_index / 8) {
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

    fn decode_elias_gamma_entry(
        &self,
        start_bit_index: usize,
    ) -> anyhow::Result<EliasGammaDecoded> {
        if self.bitmap.is_empty() {
            return Ok(EliasGammaDecoded::default());
        }

        let first_bit_index = match self.index_of_first_set_bit(start_bit_index) {
            Some(index) => index,
            None => {
                return Ok(EliasGammaDecoded::default());
            }
        };
        let zero_count: usize = first_bit_index - start_bit_index;
        let remainder: u64 = if zero_count == 0 {
            0
        } else {
            self.read_integer_from_binary(first_bit_index + 1, first_bit_index + zero_count)
        };

        Ok(EliasGammaDecoded {
            value: 2_u64.pow(zero_count.try_into()?) + remainder,
            last_bit_index: first_bit_index + zero_count,
        })
    }

    pub fn decompress(&self) -> anyhow::Result<DecompressedBitmap> {
        let compressed_bit_length: usize = self.bitmap.len() * 8;
        let mut current_bit_value: bool = (self.bitmap[0] & 0b10000000) > 0;
        let mut decompressed: DecompressedBitmap =
            DecompressedBitmap::new(self.start_block_height, None);

        let mut compressed_bit_index = 1;
        let mut decompressed_bit_index = 0;

        while compressed_bit_index < compressed_bit_length {
            let decoded_elias_gamma = self.decode_elias_gamma_entry(compressed_bit_index)?;
            if decoded_elias_gamma.value == 0 {
                break;
            }

            compressed_bit_index = decoded_elias_gamma.last_bit_index + 1;
            let mut bit_index_offset: usize = 0;
            while current_bit_value
                && (bit_index_offset < usize::try_from(decoded_elias_gamma.value)?)
            {
                while decompressed_bit_index + bit_index_offset >= (decompressed.bitmap.len() * 8) {
                    decompressed.bitmap.push(0b00000000);
                }
                decompressed.set_bit(decompressed_bit_index + bit_index_offset, true, true);
                bit_index_offset += 1;
            }

            decompressed_bit_index += usize::try_from(decoded_elias_gamma.value)?;
            current_bit_value = !current_bit_value;
        }

        Ok(decompressed)
    }
}

/// Represents a bitmap of block heights, starting from a given block height.
///
/// Each bit in the `bitmap` corresponds to a sequential block height, starting from
/// the `start_block_height`. For example, with a `start_block_height` of 10, the
/// first bit in the bitmap represents block height 10, the second bit represents
/// block height 11, and so on. A bit set to 1 corresponds to a matching block height.
///
/// # Visual Example
///
/// Given the following `DecompressedBitmap`:
/// ```
/// let decompressed = DecompressedBitmap {
///   start_block_height: 10,
///   bitmap: [0b00000001, 0b00000000, 0b00001001]
/// }
/// ```
///
/// bits:  0 0 0 0 0 0 0 1  0 0 0 0 0 0 0 0  0 0 0 0 1 0 0 1
///                      ^                           ^     ^
/// index:               7                           20    23
///
/// We get the following block heights:
/// - 17 (10 + 7)
/// - 30 (10 + 20)
/// - 33 (10 + 23)
#[derive(Debug, Default, PartialEq)]
pub struct DecompressedBitmap {
    pub start_block_height: u64,
    pub bitmap: Vec<u8>,
}

impl DecompressedBitmap {
    pub fn new(start_block_height: u64, bitmap: Option<Vec<u8>>) -> Self {
        Self {
            start_block_height,
            bitmap: bitmap.unwrap_or_default(),
        }
    }

    pub fn iter(&self) -> DecompressedBitmapIter {
        DecompressedBitmapIter::new(self)
    }

    pub fn get_bit(&self, bit_index: usize) -> bool {
        let byte_index: usize = bit_index / 8;
        let bit_index_in_byte: usize = bit_index % 8;

        (self.bitmap[byte_index] & (1u8 << (7 - bit_index_in_byte))) > 0
    }

    fn set_bit(&mut self, bit_index: usize, bit_value: bool, write_zero: bool) {
        if !bit_value && write_zero {
            self.bitmap[bit_index / 8] &= !(1u8 << (7 - (bit_index % 8)));
        } else if bit_value {
            self.bitmap[bit_index / 8] |= 1u8 << (7 - (bit_index % 8));
        }
    }

    pub fn merge(&mut self, mut to_merge: DecompressedBitmap) -> anyhow::Result<&mut Self> {
        if to_merge.start_block_height < self.start_block_height {
            std::mem::swap(&mut self.bitmap, &mut to_merge.bitmap);
            std::mem::swap(
                &mut self.start_block_height,
                &mut to_merge.start_block_height,
            );
        }

        let block_height_difference = to_merge.start_block_height - self.start_block_height;
        let start_bit_index: usize = usize::try_from(block_height_difference)?;

        for bit_index_offset in 0..(to_merge.bitmap.len() * 8) {
            let bit_value = to_merge.get_bit(bit_index_offset);
            while start_bit_index + bit_index_offset >= self.bitmap.len() * 8 {
                self.bitmap.push(0b00000000);
            }

            self.set_bit(start_bit_index + bit_index_offset, bit_value, false);
        }

        Ok(self)
    }
}

/// The `DecompressedBitmapIter` struct provides an iterator over the
/// `DecompressedBitmap`, yielding all matching block heights based on the set
/// bits in the bitmap, starting from the start block height.
pub struct DecompressedBitmapIter<'a> {
    data: &'a DecompressedBitmap,
    bit_index: usize,
}

impl<'a> DecompressedBitmapIter<'a> {
    fn new(data: &'a DecompressedBitmap) -> Self {
        Self { data, bit_index: 0 }
    }
}

impl Iterator for DecompressedBitmapIter<'_> {
    type Item = u64;

    fn next(&mut self) -> Option<Self::Item> {
        while self.bit_index < self.data.bitmap.len() * 8 {
            if self.data.get_bit(self.bit_index) {
                self.bit_index += 1;
                return Some(self.data.start_block_height + (self.bit_index as u64) - 1);
            }
            self.bit_index += 1;
        }
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decode_base_64() {
        let base64 = Base64Bitmap {
            base64: "wA==".to_string(),
            start_block_height: 10,
        };

        assert_eq!(
            CompressedBitmap::try_from(&base64).unwrap().bitmap,
            vec![0b11000000]
        );
    }

    #[test]
    fn get_bit() {
        let bytes = vec![0b00000001, 0b00000000, 0b00001001];
        let bitmap = DecompressedBitmap::new(0, Some(bytes));
        let results: Vec<bool> = [7, 8, 9, 15, 19, 20, 22, 23]
            .iter()
            .map(|index| bitmap.get_bit(*index))
            .collect();
        assert_eq!(
            results,
            [true, false, false, false, false, true, false, true]
        );
    }

    #[test]
    fn iterate_decompressed_bitmap() {
        let bytes = vec![0b00000001, 0b00000000, 0b00001001];
        let bitmap = DecompressedBitmap::new(0, Some(bytes));
        let results: Vec<u64> = bitmap.iter().collect();
        assert_eq!(results, [7, 20, 23]);
    }

    #[test]
    fn set_bit() {
        let test_bytes = vec![0b10000000, 0b10000000, 0b00001001];
        let mut bitmap = DecompressedBitmap::new(0, Some(test_bytes.clone()));
        let correct_bytes = vec![0b00000001, 0b00000000, 0b00001001];
        bitmap.set_bit(0, false, true);
        bitmap.set_bit(7, true, true);
        bitmap.set_bit(8, false, true);
        bitmap.set_bit(12, false, false);
        assert_eq!(correct_bytes, bitmap.bitmap);
    }

    #[test]
    fn get_unsigned_integer_from_binary_sequence() {
        let bytes = vec![0b11111110, 0b10010100, 0b10001101];
        let bitmap = CompressedBitmap::new(0, bytes);
        assert_eq!(bitmap.read_integer_from_binary(6, 16), 1321);
    }

    #[test]
    fn get_index_of_first_set_bit() {
        let bytes = vec![0b00000001, 0b10000000, 0b00000001, 0b00000000];
        let bitmap = CompressedBitmap::new(0, bytes);
        assert_eq!(
            bitmap.index_of_first_set_bit(4).unwrap(),
            7,
            "Should get index 7 when starting from 4",
        );
        assert_eq!(
            bitmap.index_of_first_set_bit(7).unwrap(),
            7,
            "Should get index 7 when starting from 7",
        );
        assert_eq!(
            bitmap.index_of_first_set_bit(8).unwrap(),
            8,
            "Should get index 8 when starting from 8",
        );
        assert_eq!(
            bitmap.index_of_first_set_bit(17).unwrap(),
            23,
            "Should get index 23 when starting from 17",
        );
        assert!(
            bitmap.index_of_first_set_bit(25).is_none(),
            "Should get None when starting from 25",
        );
    }

    #[test]
    fn decode_elias_gamma() {
        let bytes = vec![0b00000000, 0b00110110];
        let bitmap = CompressedBitmap::new(0, bytes);
        let decoded_eg: EliasGammaDecoded = bitmap.decode_elias_gamma_entry(6).unwrap();
        assert_eq!(decoded_eg.value, 27);
        assert_eq!(decoded_eg.last_bit_index, 14);
    }

    #[test]
    fn decode_empty_elias_gamma() {
        let bytes = vec![0b00000000, 0b00000000];
        let bitmap = CompressedBitmap::new(0, bytes);
        let decoded_eg: EliasGammaDecoded = bitmap.decode_elias_gamma_entry(0).unwrap();
        assert_eq!(decoded_eg.value, 0);
        assert_eq!(decoded_eg.last_bit_index, 0);
    }

    #[test]
    fn decompress_many_compressed_bitmaps() {
        assert_eq!(
            CompressedBitmap::new(0, vec![0b10100000])
                .decompress()
                .unwrap()
                .bitmap,
            vec![0b11000000]
        );
        assert_eq!(
            CompressedBitmap::new(0, vec![0b00100100])
                .decompress()
                .unwrap()
                .bitmap,
            vec![0b00110000]
        );
        assert_eq!(
            CompressedBitmap::new(0, vec![0b10010000])
                .decompress()
                .unwrap()
                .bitmap,
            vec![0b11110000]
        );
        assert_eq!(
            CompressedBitmap::new(0, vec![0b10110010, 0b01000000])
                .decompress()
                .unwrap()
                .bitmap,
            vec![0b11100001]
        );
        assert_eq!(
            CompressedBitmap::new(0, vec![0b01010001, 0b01010000])
                .decompress()
                .unwrap()
                .bitmap,
            vec![0b01100000, 0b11000000]
        );
        assert_eq!(
            CompressedBitmap::new(0, vec![0b01111111, 0b11111111, 0b11111000])
                .decompress()
                .unwrap()
                .bitmap,
            vec![0b01010101, 0b01010101, 0b01010000]
        );
        assert_eq!(
            CompressedBitmap::new(0, vec![0b11010101, 0b11010101, 0b11010100])
                .decompress()
                .unwrap()
                .bitmap,
            vec![0b10010001, 0b00100010, 0b01000000]
        );
        assert_eq!(
            CompressedBitmap::new(0, vec![0b00000111, 0b11100000])
                .decompress()
                .unwrap()
                .bitmap,
            vec![0b00000000, 0b00000000, 0b00000000, 0b00000001]
        );
        assert_eq!(
            CompressedBitmap::new(0, vec![0b11000001, 0b11011011])
                .decompress()
                .unwrap()
                .bitmap,
            vec![
                0b10000000, 0b00000000, 0b00000000, 0b00000000, 0b00000000, 0b00000000, 0b00000000,
                0b00001110
            ]
        );
    }

    #[test]
    fn merge_two_bitmaps() {
        let mut base_bitmap: DecompressedBitmap = DecompressedBitmap {
            bitmap: vec![0b11001010, 0b10001111],
            start_block_height: 10,
        };
        let to_merge: DecompressedBitmap = DecompressedBitmap {
            bitmap: vec![0b11100001],
            start_block_height: 14,
        };

        assert!(base_bitmap.merge(to_merge).is_ok());
        assert_eq!(base_bitmap.bitmap, vec![0b11001110, 0b10011111]);
    }

    #[test]
    fn merge_two_bitmaps_with_swap() {
        let to_merge: DecompressedBitmap = DecompressedBitmap {
            bitmap: vec![0b11001010, 0b10001111],
            start_block_height: 10,
        };
        let mut base_bitmap: DecompressedBitmap = DecompressedBitmap {
            bitmap: vec![0b11100001],
            start_block_height: 14,
        };

        assert!(base_bitmap.merge(to_merge).is_ok());
        assert_eq!(base_bitmap.bitmap, vec![0b11001110, 0b10011111]);
    }

    #[test]
    fn merge_multiple_bitmaps_together() {
        let mut base_bitmap = DecompressedBitmap::new(200, None);
        let bitmap_a = DecompressedBitmap {
            bitmap: vec![0b11000000],
            start_block_height: 18,
        };
        let bitmap_b = DecompressedBitmap {
            bitmap: vec![0b11000000],
            start_block_height: 10,
        };
        let bitmap_c = DecompressedBitmap {
            bitmap: vec![0b11000000],
            start_block_height: 14,
        };

        base_bitmap
            .merge(bitmap_a)
            .unwrap()
            .merge(bitmap_b)
            .unwrap()
            .merge(bitmap_c)
            .unwrap();
        assert_eq!(base_bitmap.bitmap, vec![0b11001100, 0b11000000]);
        assert_eq!(base_bitmap.start_block_height, 10);
    }
}
