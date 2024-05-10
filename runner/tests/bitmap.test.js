const { describe, expect, test, it } = require('@jest/globals');
const { indexArrayToBitmap, bitmapToString } = require('../bitmap');

describe('Bitmap Indexes', () => {
  const table = [
    { arr: [2, 3], expected: '00110000' },
    { arr: [0, 1, 2, 3], expected: '11110000' },
    { arr: [0, 1, 2, 7], expected: '11100001' },
    { arr: [1, 2, 8, 9], expected: '0110000011000000' },
    { arr: [31], expected: Array(31).fill('0').join('') + '1' }
  ];
  describe('Bitmap Array to String', () => {
    it.each(table)('Should serialize $arr to $expected', ({ arr, expected }) => {
      const bitmap = indexArrayToBitmap(arr);
      const strBits = bitmapToString(bitmap);
      expect(strBits).toBe(expected);
    });
    it.each(table)('Should de-serialize $expected to $arr', ({ arr, expected }) => {
      const res = bitmapStringToIndexArray(expected);
      expect(res.toString()).toBe(arr.toString());
    });
    it.each(table)('Should convert bitmap string $expected to array and back', ({ expected }) => {
      const bitmap = strBitmapToBitmap(expected);
      const bitmapStr = bitmapToString(bitmap);
      expect(bitmapStr).toBe(expected);
    });
  });

//   it.each(table)('Compresses $arr indexes sequentially', ({ arr, expected }) => {
//     const compressedBase64 = arr.reduce((compressedAcc, idx) => {
//       const before = decompressBase64(compressedAcc);
//       const compressed = addIndexCompressedFast(compressedAcc, idx);
//       const after = decompressBase64(compressed);
//       console.log(`adding ${idx}: ${before} -> ${after} (${compressed})`);
//       return compressed;
//     }, '');
//     expect(decompressBase64(compressedBase64)).toBe(expected);
//     expect(indexArrayFromCompressedBase64(compressedBase64).toString()).toBe(arr.toString());
//   });

//   it('Should compress 0 index correctly', () => {
//     const compressed = addIndexCompressed('', 0);
//     const compressedFast = addIndexCompressedFast('', 0);
//     console.log('decompressed', decompressBase64(compressed));
//   });

//   it('Should decompress to bitmap correctly', () => {
//     const compressed = addIndexCompressed('', 2);
//     // compressed = addIndexCompressed(compressed, 3);
//     const slowDecompressed = decompressBase64(compressed);
//     const { result: resFast } = decompressToBitmapArray(Buffer.from(compressed, 'base64'));
//     const fastDecompressed = bitmapToString(resFast);

//     console.log('slowDecompressed', slowDecompressed);
//     console.log('fastDecompressed', fastDecompressed);
//   });
});