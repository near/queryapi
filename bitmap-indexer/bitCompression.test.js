const { describe, expect, test, it } = require("@jest/globals");
const {
  addIndexCompressed,
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
} = require("./helpers");
const { performance } = require("node:perf_hooks");

describe("Bitmap Indexes", () => {
  beforeEach(() => {
    global.console = require("console");
  });
  const table = [
    { arr: [2, 3], expected: "00110000" },
    { arr: [0, 1, 2, 3], expected: "11110000" },
    { arr: [0, 1, 2, 7], expected: "11100001" },
    { arr: [1, 2, 8, 9], expected: "0110000011000000" },
    { arr: [31], expected: Array(31).fill("0").join("") + "1" },
  ];
  const compressedCases = [
    {
      arr: [2, 3],
      bitmap: "00110000",
      compressed: "0 010 010 00100 0000",
      expectedLastEGStartBit: 4,
      expectedLastEGBitValue: false,
    },
    {
      arr: [7],
      bitmap: "00000001",
      compressed: "0 00111 1 0",
      expectedLastEGStartBit: 6,
      expectedLastEGBitValue: true,
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
    ({
      arr,
      bitmap,
      compressed,
      expectedLastEGStartBit,
      expectedLastEGBitValue,
    }) => {
      let comp = addIndexCompressed("", arr[0]);
      comp = addIndexCompressed(comp.compressed, arr[1]);
      const compressedString = base64BitmapToString(comp.compressed);
      expect(compressedString).toBe(compressed.replace(/\s/g, ""));
      expect(comp.lastEliasGammaStartBit).toBe(expectedLastEGStartBit);
      expect(comp.lastEliasGammaBitValue).toBe(expectedLastEGBitValue);
    },
  );

  const compressLastCases = [
    // {
    //   arr: [2, 3],
    //   newIndex: 4,
    //   bitmap: "00111000",
    //   compressed: "0 010 011 011 000000",
    //   expectedLastEGStartBit: 4,
    // },
    // {
    //   arr: [6, 7],
    //   newIndex: 10,
    //   bitmap: "0000001100100000",
    //   compressed: "0 010 1 010 1 010 0000",
    //   expectedLastEGStartBit: 8,
    // },
    {
      arr: [7, 9],
      newIndex: 14,
      bitmap: "0000000101000010",
      compressed: "0 00111 1 1 1 00100 1 1",
      expectedLastEGStartBit: 14,
    },
    // {
    //   arr: [7],
    //   newIndex: 16,
    //   bitmap: "00000001 00000000 10000000",
    //   compressed: "0 00111 1 0001000 1 00111 0000",
    //   expectedLastEGStartBit: 14,
    // },
  ];

  it.each(compressLastCases)(
    `Should add bit=$newIndex into a compressed $arr`,
    ({ arr, bitmap, newIndex, compressed, expectedLastEGStartBit }) => {
      let compressedBase64 = arr.reduce(
        (acc, idx) => addIndexCompressed(acc.compressed, idx),
        { compressed: "", lastEliasGammaStartBit: -1, maxIndex: -1 },
      );
      const compressedFull = addIndexCompressed(
        compressedBase64.compressed,
        newIndex,
      );
      compressedBase64 = addIndexCompressedLast(
        compressedBase64.compressed,
        newIndex,
        compressedBase64.lastEliasGammaStartBit,
        compressedBase64.maxIndex,
      );
      expect(compressedBase64ToBitmapString(compressedBase64.compressed)).toBe(
        compressedBase64ToBitmapString(compressedFull.compressed),
      );

      const actual = compressedBase64ToBitmapString(
        compressedBase64.compressed,
      );

      expect(actual).toBe(bitmap.replace(/\s/g, ""));

      // expect(decompressBase64(compressedBase64.compressed)).toBe(
      //   bitmap.replace(/\s/g, ""),
      // );
    },
  );

  it.each(table)(
    `Compresses $arr indexes sequentially`,
    ({ arr, expected }) => {
      const compressedBase64 = arr.reduce((compressedAcc, idx) => {
        const before = decompressBase64(compressedAcc);
        const { compressed } = addIndexCompressed(compressedAcc, idx);
        const after = decompressBase64(compressed);
        console.log(`adding ${idx}: ${before} -> ${after} (${compressed})`);
        return compressed;
      }, "");
      expect(decompressBase64(compressedBase64)).toBe(expected);
      expect(indexArrayFromCompressedBase64(compressedBase64).toString()).toBe(
        arr.toString(),
      );
    },
  );

  it("Should compress 0 index correctly", () => {
    const { compressed } = addIndexCompressed("", 0);
    console.log("decompressed", decompressBase64(compressed));
  });

  it("Should decompress to bitmap correctly", () => {
    const index = 1;
    let { compressed } = addIndexCompressed("", index);
    //compressed = addIndexCompressed(compressed, 3);
    //compressed = addIndexCompressed(compressed, 3);
    //const slowDecompressed = decompressBase64(compressed);
    const resFast = decompressToBitmapArray(Buffer.from(compressed, "base64"));
    const fastDecompressed = bitmapToString(resFast);

    expect(fastDecompressed).toBe(indexArrayToBitmapString([index]));
  });
});
