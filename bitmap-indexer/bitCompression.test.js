const { describe, expect, test, it } = require("@jest/globals");
const {
  addIndexCompressed,
  bitmapStringToIndexArray,
  indexArrayToBitmap,
  strBitmapToBitmap,
  decompressToBitmapArray,
} = require("./bitmap");
const {
  decompressBase64,
  bitmapToString,
  indexArrayFromCompressedBase64,
  indexArrayToBitmapString,
  base64BitmapToString,
} = require("./helpers");

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
      expectedLastEGStartBit: 7,
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
    `Return correct lastEliasGammaStartBit for $arr`,
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

  it("Should add index into a compressed bitmap", () => {
    const { compressed } = addIndexCompressed("", 0);
    expect(decompressBase64(compressed)).toBe("0");
  });

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
