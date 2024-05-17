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
  beforeEach(() => {
    global.console = require("console");
  });
  it("TEST", () => {
    console.log(decompressBase64ToBitmapString("wdvA"));
  });
  const table = [
    { arr: [0, 1], expected: "11000000" },
    { arr: [2, 3], expected: "00110000" },
    { arr: [0, 1, 2, 3], expected: "11110000" },
    { arr: [0, 1, 2, 7], expected: "11100001" },
    { arr: [1, 2, 8, 9], expected: "0110000011000000" },
    { arr: [1, 3, 5, 7, 9, 11, 13, 15, 17, 19], expected: "010101010101010101010000" },
    { arr: [0, 3, 7, 10, 14, 17], expected: "100100010010001001000000" },
    { arr: [31], expected: Array(31).fill("0").join("") + "1" },
    { arr: [0, 60, 61, 62], expected: "1000000000000000000000000000000000000000000000000000000000001110"}
  ];
  const compressedCases = [
    {
      arr: [2, 3],
      bitmap: "00110000",
      compressed: "0 010 010 00100 0000",
      expectedLastEGStartBit: 4,
    },
    {
      arr: [7],
      bitmap: "00000001",
      compressed: "0 00111 1 0",
      expectedLastEGStartBit: 6,
    },
  ];
  const compressLastCases = [
    {
      arr: [2, 3],
      newIndex: 4,
      bitmap: "00111000",
      compressed: "0 010 011 011 000000",
      expectedLastEGStartBit: 4,
    },
    {
      arr: [6, 7],
      newIndex: 10,
      bitmap: "0000001100100000",
      compressed: "0 00110 010 010 1 00101 000000",
      expectedLastEGStartBit: 12,
    },
    {
      arr: [7, 9],
      newIndex: 14,
      bitmap: "0000000101000010",
      compressed: "0 00111 1 1 1 00100 1 1",
      expectedLastEGStartBit: 14,
    },
    {
      arr: [7],
      newIndex: 16,
      bitmap: "00000001 00000000 10000000",
      compressed: "0 00111 1 0001000 1 00111 0000",
      expectedLastEGStartBit: 14,
    },
  ];
  describe("Bitmap Array to String", () => {
    it.each(table)(
      `Should serialize $arr to $expected`,
      ({ arr, expected }) => {
        const bitmap = indexArrayToBitmap(arr);
        const strBits = bitmapToString(bitmap);
        expect(strBits).toBe(expected);
      },
    );
    it.each(table)(
      `Should de-serialize $expected to $arr`,
      ({ arr, expected }) => {
        const res = bitmapStringToIndexArray(expected);
        expect(res.toString()).toBe(arr.toString());
      },
    );
    it.each(table)(
      `Should convert bitmap string $expected to array and back`,
      ({ expected }) => {
        const bitmap = strBitmapToBitmap(expected);
        const bitmapStr = bitmapToString(bitmap);
        expect(bitmapStr).toBe(expected);
      },
    );
  });

  it.each(compressedCases)(
    `Return correct lastEliasGammaStartBit=$expectedLastEGStartBit for $arr`,
    ({ arr, bitmap, compressed, expectedLastEGStartBit }) => {
      let comp = addIndexCompressedFull("", arr[0]);
      comp = addIndexCompressedFull(comp.compressed, arr[1]);
      const compressedString = base64BitmapToString(comp.compressed);
      expect(compressedString).toBe(compressed.replace(/\s/g, ""));
      expect(comp.lastEliasGammaStartBit).toBe(expectedLastEGStartBit);
    },
  );

  it.each(compressLastCases)(
    `Should add bit=$newIndex into a compressed $arr`,
    ({ arr, bitmap, newIndex, compressed, expectedLastEGStartBit }) => {
      let compressedBase64 = arr.reduce(
        (acc, idx) => addIndexCompressedFull(acc.compressed, idx),
        { compressed: "", lastEliasGammaStartBit: -1, maxIndex: -1 },
      );
      const compressedFull = addIndexCompressedFull(
        compressedBase64.compressed,
        newIndex,
      );
      compressedBase64 = addIndexCompressedLast(
        compressedBase64.compressed,
        newIndex,
        compressedBase64.lastEliasGammaStartBit,
        compressedBase64.maxIndex,
      );
      // assert that manually computed expectation is correct
      expect(compressedBase64ToBitmapString(compressedBase64.compressed)).toBe(
        compressed.replace(/\s/g, ""),
      );
      // assert that addIndexCompressedFull is the same as the addIndexCompressedFullLast
      expect(compressedBase64ToBitmapString(compressedBase64.compressed)).toBe(
        compressedBase64ToBitmapString(compressedFull.compressed),
      );

      // assert that resulting bitmap is correct
      const actualBitmap = decompressBase64ToBitmapString(
        compressedBase64.compressed,
      );
      expect(actualBitmap).toBe(bitmap.replace(/\s/g, ""));

      // assert that lastEliasGammaStartBit is correct
      expect(compressedBase64.lastEliasGammaStartBit).toBe(
        expectedLastEGStartBit,
      );
    },
  );

  it.each(table)(
    `Compresses $arr indexes sequentially using addIndexCompressedFull`,
    ({ arr, expected }) => {
      const compressedBase64 = arr.reduce((compressedAcc, idx) => {
        const before = decompressBase64ToBitmapString(compressedAcc);
        const { compressed } = addIndexCompressedFull(compressedAcc, idx);
        const after = decompressBase64ToBitmapString(compressed);
        console.log(`adding ${idx}: ${before} -> ${after} (${compressed})`);
        return compressed;
      }, "");
      expect(decompressBase64ToBitmapString(compressedBase64)).toBe(expected);
      expect(indexArrayFromCompressedBase64(compressedBase64).toString()).toBe(
        arr.toString(),
      );
    },
  );

  it.each(table)(
    `Compresses $arr indexes sequentially using addIndexCompressedLast`,
    ({ arr, expected }) => {
      const result = arr.reduce(
        (compressedAcc, idx) => {
          const before = decompressBase64ToBitmapString(
            compressedAcc.compressed,
          );
          const res = before === "" ? addIndexCompressedFull(compressedAcc.compressed, idx) : addIndexCompressedLast(
            compressedAcc.compressed,
            idx,
            compressedAcc.lastEliasGammaStartBit,
            compressedAcc.maxIndex,
          );
          const after = decompressBase64ToBitmapString(res.compressed);
          console.log(
            `adding ${idx}: ${before} -> ${after} (${res.compressed})`,
          );
          return res;
        },
        { compressed: "", lastEliasGammaStartBit: -1, maxIndex: -1 },
      );
      expect(decompressBase64ToBitmapString(result.compressed)).toBe(expected);
      expect(indexArrayFromCompressedBase64(result.compressed).toString()).toBe(
        arr.toString(),
      );
    },
  );

  it("Should compress 0 index correctly", () => {
    const { compressed } = addIndexCompressedFull("", 0);
    console.log("decompressed", decompressBase64(compressed));
  });

  it("Should decompress to bitmap correctly", () => {
    const index = 1;
    let { compressed } = addIndexCompressedFull("", index);
    const resFast = decompressToBitmapArray(Buffer.from(compressed, "base64"));
    const fastDecompressed = bitmapToString(resFast);

    expect(fastDecompressed).toBe(indexArrayToBitmapString([index]));
  });
});
