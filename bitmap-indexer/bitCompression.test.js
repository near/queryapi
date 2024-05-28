const { describe, expect, test, it } = require("@jest/globals");
const {
  addIndexCompressedFull,
  decompressToBitmapArray,
  addIndexCompressedLast,
} = require("./bitmap");
const {
  decompressBase64,
  bitmapToString,
  indexArrayFromCompressedBase64,
  indexArrayToBitmapString,
  indexArrayToBitmap,
  bitmapStringToIndexArray,
  strBitmapToBitmap,
  base64BitmapToString,
  compressedBase64ToBitmapString,
  decompressBase64ToBitmapString,
} = require("./helpers");
const { performance } = require("node:perf_hooks");

describe("Bitmap Indexes", () => {
  it('BLAH', () => {
    const databricksArr = indexArrayFromCompressedBase64("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",
      115130289);
    const queryapiArr = indexArrayFromCompressedBase64("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",
      115130289);
    console.log('Unique to databricks', databricksArr.filter(x => !queryapiArr.includes(x)));
    console.log('Unique to queryapi', queryapiArr.filter(x => !databricksArr.includes(x)));
  });
  // beforeEach(() => {
  //   global.console = require("console");
  // });
  // const table = [
  //   { arr: [0, 1], expected: "11000000" },
  //   { arr: [2, 3], expected: "00110000" },
  //   { arr: [0, 1, 2, 3], expected: "11110000" },
  //   { arr: [0, 1, 2, 7], expected: "11100001" },
  //   { arr: [1, 2, 8, 9], expected: "0110000011000000" },
  //   { arr: [1, 3, 5, 7, 9, 11, 13, 15, 17, 19], expected: "010101010101010101010000" },
  //   { arr: [0, 3, 7, 10, 14, 17], expected: "100100010010001001000000" },
  //   { arr: [31], expected: Array(31).fill("0").join("") + "1" },
  //   { arr: [0, 60, 61, 62], expected: "1000000000000000000000000000000000000000000000000000000000001110"}
  // ];
  // const compressedCases = [
  //   {
  //     arr: [2, 3],
  //     bitmap: "00110000",
  //     compressed: "0 010 010 0",
  //     expectedLastEGStartBit: 4,
  //   },
  //   {
  //     arr: [7],
  //     bitmap: "00000001",
  //     compressed: "0 00111 1 0",
  //     expectedLastEGStartBit: 6,
  //   },
  // ];
  // const compressLastCases = [
  //   {
  //     arr: [2, 3],
  //     newIndex: 4,
  //     bitmap: "00111000",
  //     compressed: "0 010 011 0",
  //     expectedLastEGStartBit: 4,
  //   },
  //   {
  //     arr: [6, 7],
  //     newIndex: 10,
  //     bitmap: "0000001100100000",
  //     compressed: "0 00110 010 010 1 000",
  //     expectedLastEGStartBit: 12,
  //   },
  //   {
  //     arr: [7, 9],
  //     newIndex: 14,
  //     bitmap: "0000000101000010",
  //     compressed: "0 00111 1 1 1 00100 1 0",
  //     expectedLastEGStartBit: 14,
  //   },
  //   {
  //     arr: [7],
  //     newIndex: 15,
  //     bitmap: "00000001 00000001",
  //     compressed: "0 00111 1 00111 1 000",
  //     expectedLastEGStartBit: 12,
  //   },
  //   {
  //     arr: [7],
  //     newIndex: 16,
  //     bitmap: "00000001 00000000 10000000",
  //     compressed: "0 00111 1 0001000 1 0",
  //     expectedLastEGStartBit: 14,
  //   },
  // ];
  // describe("Bitmap Array to String", () => {
  //   it.each(table)(
  //     `Should serialize $arr to $expected`,
  //     ({ arr, expected }) => {
  //       const bitmap = indexArrayToBitmap(arr);
  //       const strBits = bitmapToString(bitmap);
  //       expect(strBits).toBe(expected);
  //     },
  //   );
  //   it.each(table)(
  //     `Should de-serialize $expected to $arr`,
  //     ({ arr, expected }) => {
  //       const res = bitmapStringToIndexArray(expected);
  //       expect(res.toString()).toBe(arr.toString());
  //     },
  //   );
  //   it.each(table)(
  //     `Should convert bitmap string $expected to array and back`,
  //     ({ expected }) => {
  //       const bitmap = strBitmapToBitmap(expected);
  //       const bitmapStr = bitmapToString(bitmap);
  //       expect(bitmapStr).toBe(expected);
  //     },
  //   );
  // });

  // it.each(compressedCases)(
  //   `Return correct lastEliasGammaStartBit=$expectedLastEGStartBit for $arr`,
  //   ({ arr, bitmap, compressed, expectedLastEGStartBit }) => {
  //     let comp = addIndexCompressedFull("", arr[0]);
  //     comp = addIndexCompressedFull(comp.compressed, arr[1]);
  //     const compressedString = base64BitmapToString(comp.compressed);
  //     expect(compressedString).toBe(compressed.replace(/\s/g, ""));
  //     expect(comp.lastEliasGammaStartBit).toBe(expectedLastEGStartBit);
  //   },
  // );

  // it.each(compressLastCases)(
  //   `Should add bit=$newIndex into a compressed $arr`,
  //   ({ arr, bitmap, newIndex, compressed, expectedLastEGStartBit }) => {
  //     let compressedBase64 = arr.reduce(
  //       (acc, idx) => addIndexCompressedFull(acc.compressed, idx),
  //       { compressed: "", lastEliasGammaStartBit: -1, maxIndex: -1 },
  //     );
  //     const compressedFull = addIndexCompressedFull(
  //       compressedBase64.compressed,
  //       newIndex,
  //     );
  //     compressedLast = addIndexCompressedLast(
  //       compressedBase64.compressed,
  //       newIndex,
  //       compressedBase64.lastEliasGammaStartBit,
  //       compressedBase64.maxIndex,
  //     );
  //     console.log(
  //       `adding ${newIndex}: ${decompressBase64ToBitmapString(compressedBase64.compressed)} -> ${decompressBase64ToBitmapString(compressedLast.compressed)} (${compressedLast.compressed})\n`,
  //     );
  //     // assert that manually computed expectation is correct
  //     expect(compressedBase64ToBitmapString(compressedLast.compressed)).toBe(
  //       compressed.replace(/\s/g, ""),
  //     );
  //     // assert that addIndexCompressedFull is the same as the addIndexCompressedFullLast
  //     expect(compressedBase64ToBitmapString(compressedLast.compressed)).toBe(
  //       compressedBase64ToBitmapString(compressedFull.compressed),
  //     );

  //     // assert that resulting bitmap is correct
  //     const actualBitmap = decompressBase64ToBitmapString(
  //       compressedLast.compressed,
  //     );
  //     expect(actualBitmap).toBe(bitmap.replace(/\s/g, ""));

  //     // assert that lastEliasGammaStartBit is correct
  //     expect(compressedLast.lastEliasGammaStartBit).toBe(
  //       expectedLastEGStartBit,
  //     );
  //   },
  // );

  // it.each(table)(
  //   `Compresses $arr indexes sequentially using addIndexCompressedFull`,
  //   ({ arr, expected }) => {
  //     const compressedBase64 = arr.reduce((compressedAcc, idx) => {
  //       const before = decompressBase64ToBitmapString(compressedAcc);
  //       const { compressed } = addIndexCompressedFull(compressedAcc, idx);
  //       const after = decompressBase64ToBitmapString(compressed);
  //       console.log(`adding ${idx}: ${before} -> ${after} (${compressed})`);
  //       return compressed;
  //     }, "");
  //     expect(decompressBase64ToBitmapString(compressedBase64)).toBe(expected);
  //     expect(indexArrayFromCompressedBase64(compressedBase64).toString()).toBe(
  //       arr.toString(),
  //     );
  //   },
  // );

  // it.each(table)(
  //   `Compresses $arr indexes sequentially using addIndexCompressedLast`,
  //   ({ arr, expected }) => {
  //     const result = arr.reduce(
  //       (compressedAcc, idx) => {
  //         const before = decompressBase64ToBitmapString(
  //           compressedAcc.compressed,
  //         );
  //         const res = before === "" ? addIndexCompressedFull(compressedAcc.compressed, idx) : addIndexCompressedLast(
  //           compressedAcc.compressed,
  //           idx,
  //           compressedAcc.lastEliasGammaStartBit,
  //           compressedAcc.maxIndex,
  //         );
  //         const after = decompressBase64ToBitmapString(res.compressed);
  //         console.log(
  //           `adding ${idx}: ${before} -> ${after} (${res.compressed})\n`,
  //         );
  //         return res;
  //       },
  //       { compressed: "", lastEliasGammaStartBit: -1, maxIndex: -1 },
  //     );
  //     expect(decompressBase64ToBitmapString(result.compressed)).toBe(expected);
  //     expect(indexArrayFromCompressedBase64(result.compressed).toString()).toBe(
  //       arr.toString(),
  //     );
  //   },
  // );

  // it("Should compress 0 index correctly", () => {
  //   const { compressed } = addIndexCompressedFull("", 0);
  //   console.log("decompressed", decompressBase64(compressed));
  // });

  // it("Should decompress to bitmap correctly", () => {
  //   const index = 1;
  //   let { compressed } = addIndexCompressedFull("", index);
  //   const resFast = decompressToBitmapArray(Buffer.from(compressed, "base64"));
  //   const fastDecompressed = bitmapToString(resFast);

  //   expect(fastDecompressed).toBe(indexArrayToBitmapString([index]));
  // });
});
