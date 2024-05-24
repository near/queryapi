use anyhow::anyhow;

// const BLOCK_HEIGHTS_IN_DAY: usize = 86000;

pub struct Bitmap {
    pub start_block_height: usize,
    pub bitmap: Vec<u8>,
}

struct EliasGammaDecoded {
    pub value: usize,
    pub last_bit_index: usize,
}

pub struct BitmapOperator {}

#[cfg_attr(test, mockall::automock)]
impl BitmapOperator {
    pub fn new() -> Self {
        Self {}
    }

    fn get_bit(&self, byte_array: &[u8], bit_index: usize) -> bool {
        let byte_index: usize = bit_index / 8;
        let bit_index_in_byte: usize = bit_index % 8;
        return (byte_array[byte_index] & (1u8 << (7 - bit_index_in_byte))) > 0;
    }

    fn set_bit(
        &self,
        byte_array: &mut [u8],
        bit_index: usize,
        bit_value: bool,
        write_zero: Option<bool>,
    ) {
        if !bit_value && write_zero.unwrap_or(false) {
            byte_array[bit_index / 8] &= !(1u8 << (7 - (bit_index % 8)));
        } else if bit_value {
            byte_array[bit_index / 8] |= 1u8 << (7 - (bit_index % 8));
        }
    }

    fn get_number_between_bits(
        &self,
        byte_array: &[u8],
        start_bit_index: usize,
        end_bit_index: usize,
    ) -> u32 {
        let mut number: u32 = 0;
        // Read bits from right to left
        for curr_bit_index in (start_bit_index..=end_bit_index).rev() {
            if self.get_bit(byte_array, curr_bit_index) {
                number |= 1u32 << (end_bit_index - curr_bit_index);
            }
        }
        number
    }

    fn index_of_first_bit(
        &self,
        byte_array: &[u8],
        start_bit_index: usize,
    ) -> anyhow::Result<usize> {
        let mut first_bit_index: usize = start_bit_index % 8;
        for byte_index in (start_bit_index / 8)..byte_array.len() {
            if byte_array[byte_index] > 0 {
                for bit_index in first_bit_index..=7 {
                    if byte_array[byte_index] & (1u8 << (7 - bit_index)) > 0 {
                        return Ok(byte_index * 8 + bit_index);
                    }
                }
            }
            first_bit_index = 0;
        }
        return Err(anyhow!("Failed to find a bit with value 1 in byte array"));
    }

    fn decode_elias_gamma_entry(
        &self,
        byte_array: &[u8],
        start_bit_index: usize,
    ) -> EliasGammaDecoded {
        if byte_array.len() == 0 {
            return EliasGammaDecoded {
                value: 0,
                last_bit_index: 0,
            };
        }
        let first_bit_index = match self.index_of_first_bit(byte_array, start_bit_index) {
            Ok(index) => index,
            Err(_) => {
                return EliasGammaDecoded {
                    value: 0,
                    last_bit_index: 0,
                }
            }
        };
        let zero_count: usize = first_bit_index - start_bit_index;
        let remainder: usize = if zero_count == 0 {
            0
        } else {
            self.get_number_between_bits(
                byte_array,
                first_bit_index + 1,
                first_bit_index + zero_count,
            )
            .try_into()
            .unwrap()
        };
        return EliasGammaDecoded {
            value: 2_usize.pow(zero_count.try_into().unwrap()) + remainder,
            last_bit_index: first_bit_index + zero_count,
        };
    }

    fn decompress_bitmap(&self, compressed_bitmap: &Bitmap) -> Bitmap {
        let compressed_bit_length: usize = compressed_bitmap.bitmap.len() * 8;
        let mut current_bit_value: bool = (compressed_bitmap.bitmap[0] & 0b10000000) > 0;
        let compressed_byte_array = &compressed_bitmap.bitmap;
        let mut decompressed_byte_array: Vec<u8> = Vec::new();

        let mut compressed_bit_index = 1;
        let mut decompressed_bit_index = 0;

        while compressed_bit_index < compressed_bit_length {
            let decoded_elias_gamma =
                self.decode_elias_gamma_entry(compressed_byte_array, compressed_bit_index);
            if decoded_elias_gamma.value == 0 {
                break;
            }

            compressed_bit_index = decoded_elias_gamma.last_bit_index + 1;
            let mut bit_index_offset: usize = 0;
            while current_bit_value && (bit_index_offset < decoded_elias_gamma.value) {
                if decompressed_bit_index + bit_index_offset >= decompressed_byte_array.len() {
                    decompressed_byte_array.push(0b00000000);
                }
                self.set_bit(
                    &mut decompressed_byte_array,
                    decompressed_bit_index + bit_index_offset,
                    true,
                    Some(true),
                );
                bit_index_offset = bit_index_offset + 1;
            }

            decompressed_bit_index += decoded_elias_gamma.value;
            current_bit_value = !current_bit_value;
        }

        Bitmap {
            bitmap: decompressed_byte_array,
            start_block_height: compressed_bitmap.start_block_height,
        }
    }

    // pub fn add_compressed_bitmap(&self, base_bitmap: &mut Bitmap, add_bitmap: &Bitmap) -> () {}
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_getting_bit_from_array() {
        let operator: BitmapOperator = BitmapOperator::new();
        let byte_array: &[u8; 3] = &[0b00000001, 0b00000000, 0b00001001];
        let results: Vec<bool> = [7, 8, 9, 15, 19, 20, 22, 23]
            .iter()
            .map(|index| {
                return operator.get_bit(byte_array, *index);
            })
            .collect();
        assert_eq!(
            results,
            [true, false, false, false, false, true, false, true]
        );
    }

    #[test]
    fn test_setting_bit_in_array() {
        let operator: BitmapOperator = BitmapOperator::new();
        let correct_byte_array: &[u8; 3] = &[0b00000001, 0b00000000, 0b00001001];
        let test_byte_array: &mut [u8; 3] = &mut [0b10000000, 0b10000000, 0b00001001];
        operator.set_bit(test_byte_array, 0, false, Some(true));
        operator.set_bit(test_byte_array, 7, true, Some(true));
        operator.set_bit(test_byte_array, 8, false, Some(true));
        operator.set_bit(test_byte_array, 12, false, None);
        assert_eq!(correct_byte_array, test_byte_array);
    }

    #[test]
    fn test_getting_number_from_bita() {
        let operator: BitmapOperator = BitmapOperator::new();
        let byte_array: &[u8; 3] = &[0b11111110, 0b10010100, 0b10001101];
        assert_eq!(operator.get_number_between_bits(byte_array, 6, 16), 1321);
    }

    #[test]
    fn test_getting_index_of_first_bit() {
        let operator: BitmapOperator = BitmapOperator::new();
        let byte_array: &[u8; 3] = &[0b00000001, 0b10000000, 0b00000001];
        assert_eq!(
            operator.index_of_first_bit(byte_array, 4).unwrap(),
            7,
            "Should get index 7 when starting from 4",
        );
        assert_eq!(
            operator.index_of_first_bit(byte_array, 7).unwrap(),
            7,
            "Should get index 7 when starting from 7",
        );
        assert_eq!(
            operator.index_of_first_bit(byte_array, 8).unwrap(),
            8,
            "Should get index 8 when starting from 8",
        );
        assert_eq!(
            operator.index_of_first_bit(byte_array, 17).unwrap(),
            23,
            "Should get index 23 when starting gtom 17",
        );
    }

    #[test]
    fn test_decoding_elias_gamma() {
        let operator: BitmapOperator = BitmapOperator::new();
        let byte_array: &[u8; 2] = &[0b00000000, 0b00110110];
        let decoded_eg: EliasGammaDecoded = operator.decode_elias_gamma_entry(byte_array, 6);
        assert_eq!(decoded_eg.value, 27);
        assert_eq!(decoded_eg.last_bit_index, 14);
    }

    /* #[test]
    fn test_decoding_compressed_bitmap() {
    } */
}
