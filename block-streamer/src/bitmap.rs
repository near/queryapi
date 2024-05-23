const BLOCK_HEIGHTS_IN_DAY: usize = 86000;

pub struct Bitmap {
    pub start_block_height: i32,
    pub bitmap: [u8; BLOCK_HEIGHTS_IN_DAY / 8],
}

pub struct BitmapOperator {}

#[cfg_attr(test, mockall::automock)]
impl BitmapOperator {
    pub fn new() -> Self {
        Self {}
    }
    // pub fn add_compressed_bitmap(&self, base_bitmap: &mut Bitmap, add_bitmap: &Bitmap) -> () {}
    //
    // fn decompress_bitmap(&self, compressed_bitmap: &Bitmap) -> Bitmap {}
    //
    // fn index_of_first_bit_in_byte_array(
    //     &self,
    //     decompressed_bytes: &[u8],
    //     start_bit_index: i32,
    // ) -> i32 {
    // }
    //
    // fn get_number_between_bits(
    //     &self,
    //     decompressed_bytes: &[u8],
    //     start_bit_index: i32,
    //     end_bit_index: i32,
    // ) -> i32 {
    // }

    fn get_bit_in_byte_array(&self, decompressed_bytes: &[u8], bit_index: usize) -> bool {
        let byte_index: usize = bit_index / 8;
        let bit_index_in_byte: usize = bit_index % 8;
        return (decompressed_bytes[byte_index] & (1u8 << (7 - bit_index_in_byte))) > 0;
    }

    fn set_bit_in_byte_array(
        &self,
        decompressed_bytes: &mut [u8],
        bit_index: usize,
        bit_value: bool,
        write_zero: Option<bool>,
    ) {
        if !bit_value && write_zero.unwrap_or(false) {
            decompressed_bytes[bit_index / 8] &= !(1u8 << (7 - (bit_index % 8)));
        } else if bit_value {
            decompressed_bytes[bit_index / 8] |= 1u8 << (7 - (bit_index % 8));
        }
    }
    //
    // fn decode_elias_gamma_entry_from_bytes(
    //     &self,
    //     decompressed_bytes: &[u8],
    //     start_bit: Option<i32>,
    // ) -> &[u8] {
    // }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_getting_bit_from_array() {
        let operator: BitmapOperator = BitmapOperator::new();
        let byte_array: &[u8; 3] = &[0x01, 0x00, 0x09]; // 0000 0001 0000 0000 0000 1001
        let results: Vec<bool> = [7, 8, 9, 15, 19, 20, 22, 23]
            .iter()
            .map(|index| {
                return operator.get_bit_in_byte_array(byte_array, *index);
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
        let correct_byte_array: &[u8; 3] = &[0x01, 0x00, 0x09]; // 0000 0001 0000 0000 0000 1001
        let test_byte_array: &mut [u8; 3] = &mut [0x80, 0x80, 0x09]; // 1000 0000 1000 0000 0000 1001
        operator.set_bit_in_byte_array(test_byte_array, 0, false, Some(true));
        operator.set_bit_in_byte_array(test_byte_array, 7, true, Some(true));
        operator.set_bit_in_byte_array(test_byte_array, 8, false, Some(true));
        operator.set_bit_in_byte_array(test_byte_array, 12, false, None);
        assert_eq!(correct_byte_array, test_byte_array);
    }
}
