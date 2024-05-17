const { performance } = require("node:perf_hooks");

// Gets index of first bit in byte array starting from startBit
function indexOfFirstBitInByteArray(bytes, startBit) {
  let firstBit = startBit % 8;
  for (let iByte = ~~(startBit / 8); iByte < bytes.length; iByte++) {
    if (bytes[iByte] > 0) {
      for (let iBit = firstBit; iBit <= 7; iBit++) {
        if (bytes[iByte] & (1 << (7 - iBit))) {
          return iByte * 8 + iBit;
        }
      }
    }
    firstBit = 0;
  }
  return -1;
}

// Sets bit at bitIndex in uint8Array to bitValue
function setBitInBitmap(uint8Array, bitIndex, bitValue, writeZero = false) {
  const newLen = ((bitIndex / 8) + 1) >> 0; // Equivalent of Math.ciel using bitwise operations
  let result = uint8Array;
  if (uint8Array.length < newLen) {
    result = new Uint8Array(new ArrayBuffer(newLen));
    result.set(uint8Array);
  }
  if (!bitValue && writeZero) {
    result[~~(bitIndex / 8)] &= ~(1 << (7 - (bitIndex % 8)));
  } else if (bitValue) {
    result[~~(bitIndex / 8)] |= 1 << (7 - (bitIndex % 8));
  }
  return result;
}

// Gets bit at bitIndex in bytes
function getBitInByteArray(bytes, bitIndex) {
  const byteIndex = ~~(bitIndex / 8);
  const bitIndexInsideByte = bitIndex % 8;
  return (bytes[byteIndex] & (1 << (7 - bitIndexInsideByte))) > 0;
}

// takes numbers between [start, end] bits inclusive in byte array and
// returns decimal number they represent
function getNumberBetweenBits(bytes, start, end) {
  let result = 0;
  // Read bits from right to left
  for (let bitIndex = end; bitIndex >= start; bitIndex--) {
    if (getBitInByteArray(bytes, bitIndex)) {
      result |= 1 << (end - bitIndex);
    }
  }
  return result;
}

// Writes Elias gamma coding bits for number x into result bytes array starting with index startBit.
// Returns index of the next bit after the coding.
// Examples: https://en.wikipedia.org/wiki/Elias_gamma_coding
function writeEliasGammaBits(x, result, startBit, writeZeros = false) {
  if (x === 0) return { nextBit: startBit, result };
  if (x === 1) {
    setBitInBitmap(result, startBit, true);
    return { nextBit: startBit + 1, result };
  }
  let nextBit = startBit;
  const N = ~~Math.log2(x);
  const remainder = x - 2 ** N;
  nextBit += N;

  // Write N zeros if writeZeros is true
  for (let index = startBit; writeZeros && index <= nextBit; index++) {
    result = setBitInBitmap(result, index, 0, writeZeros);
  }
  // Write 1 to separate prefix from suffix
  result = setBitInBitmap(result, nextBit++, true, writeZeros);
  // Write remainder in binary
  for (let ri = 0; ri < N; ri++, nextBit++) {
    const bitValue = (remainder & (1 << (N - 1 - ri))) > 0;
    result = setBitInBitmap(result, nextBit, bitValue, writeZeros);
  }
  return { nextBit, result };
}

// stores first char (0 or 1) and then repeats alternating repeating sequences using Elias gamma coding
// pads the resulting string at the end with '0's for length to be divisible by 8
function compressBitmapArray(uint8Array) {
  let curBit = (uint8Array[0] & 0b10000000) > 0;
  let curBitStretch = 0;
  const resultBuffer = new ArrayBuffer(12000);
  let result = new Uint8Array(resultBuffer);
  let nextBit = 0;
  let maxIndex = 0;

  // Write first bit to curBit
  result = setBitInBitmap(result, nextBit++, curBit);

  // Write Elias gamma for alternating stretches of 1s and 0s
  let lastEliasGammaStartBit = nextBit;
  let ibit = 0;
  for (; ibit < uint8Array.length * 8; ibit++) {
    if (getBitInByteArray(uint8Array, ibit) === curBit) {
      curBitStretch++;
    } else {
      maxIndex = curBit ? ibit - 1 : maxIndex;
      lastEliasGammaStartBit = curBit ? nextBit : lastEliasGammaStartBit;
      const w = writeEliasGammaBits(curBitStretch, result, nextBit);
      nextBit = w.nextBit;
      result = w.result;
      curBit = !curBit;
      curBitStretch = 1;
    }
  }
  // Write Elias Gamma for the last stretch
  maxIndex = curBit ? ibit - 1 : maxIndex;
  lastEliasGammaStartBit = curBit ? nextBit : lastEliasGammaStartBit;
  if (curBit) {
    const w = writeEliasGammaBits(curBitStretch, result, nextBit);
    nextBit = w.nextBit;
    result = w.result;
  }
  result = result.slice(0, Math.ceil(nextBit / 8));

  return {
    result,
    lastEliasGammaStartBit,
    lastEliasGammaBitValue: curBit,
    maxIndex,
  };
}

// Returns first number x and corresponding coded bits length of the first occurrence of Elias gamma coding
function decodeEliasGammaEntryFromBytes(bytes, startBit = 0) {
  if (!bytes || bytes.length === 0) return { x: 0, lastBit: 0 };
  const idx = indexOfFirstBitInByteArray(bytes, startBit);
  if (idx < 0) {
    return { x: 0, lastBit: -1 };
  }
  const N = idx - startBit;
  const remainder = N === 0 ? 0 : getNumberBetweenBits(bytes, idx + 1, idx + N);
  return { x: 2 ** N + remainder, lastBit: idx + N };
}

// Decompresses Elias-gamma coded bytes to Uint8Array
function decompressToBitmapArray(compressedBytes) {
  const compressedBitLength = compressedBytes.length * 8;
  let curBit = (compressedBytes[0] & 0b10000000) > 0;
  const buffer = new ArrayBuffer(11000);
  const result = new Uint8Array(buffer);
  let compressedBitIdx = 1;
  let resultBitIdx = 0;
  while (compressedBitIdx < compressedBitLength) {
    // Get x, the number of bits to set, and lastBit, the bit number which is the last bit of the Elias gamma coding
    const { x, lastBit } = decodeEliasGammaEntryFromBytes(
      compressedBytes,
      compressedBitIdx,
    );
    compressedBitIdx = lastBit + 1; // Ensure next loop starts on next bit
    for (let i = 0; curBit && i < x; i++) {
      // Specifically if curBit is 1, set next x bits to 1
      setBitInBitmap(result, resultBitIdx + i, true);
    }
    resultBitIdx += x;
    curBit = !curBit; // Switch currBit for next iteration (counting 1s, then 0s, then 1s, etc.)
    if (x === 0) break; // we won't find any Elias gamma here, exiting
  }
  let bufferLength = Math.ceil(resultBitIdx / 8);
  return result.subarray(0, bufferLength);
}

// Adds a bit at position 'index' into the compressed bitmap by editing the compressed bitmap
// from the bit at index lastEliasGammaStartBit
function addIndexCompressedLast(
  compressedBase64,
  index,
  lastEliasGammaStartBit,
  maxIndex,
) {
  const originalCompressed = Buffer.from(compressedBase64, "base64");
  const resultBuffer = Buffer.alloc(12000);
  originalCompressed.copy(resultBuffer);
  // let result = new Uint8Array(resultBuffer);
  let result = resultBuffer;
  // decode the last EG section
  const { x, lastBit } = decodeEliasGammaEntryFromBytes(
    originalCompressed,
    lastEliasGammaStartBit,
  );
  let newLastEliasGammaStartBit = lastEliasGammaStartBit;
  let cur;
  if (index - maxIndex === 1) {
    // write increased stretch of 1s
    cur = writeEliasGammaBits(x + 1, result, lastEliasGammaStartBit, true);
  } else if (index - maxIndex > 1) {
    // write zeros
    const zeros = index - maxIndex - 1;
    cur = writeEliasGammaBits(zeros, result, lastBit + 1, true);
    // write 1 for the `index` bit
    newLastEliasGammaStartBit = cur.nextBit;
    cur = writeEliasGammaBits(1, cur.result, cur.nextBit, true);
  } else {
    throw Error(
      `addIndexCompressedLast: cannot write into ${index} before ${maxIndex}`,
    );
  }
  // write remaining zeros
  const lastEliasGammaEndBit = cur.nextBit - 1;
  const remainingZeros = 8 - (lastEliasGammaEndBit % 8) - 1;
  for (let i = 0; i < remainingZeros; i++) {
    result = setBitInBitmap(cur.result, cur.nextBit+i, false, true);
  }

  return {
    compressed: result.subarray(0, Math.ceil(cur.nextBit / 8)).toString("base64"),
    lastEliasGammaStartBit: newLastEliasGammaStartBit,
    maxIndex: index,
  };
}

function addIndexCompressedFull(compressedBase64, index) {
  const buf = Buffer.from(compressedBase64, "base64");
  const bitmap = decompressToBitmapArray(buf);
  const newBitmap = setBitInBitmap(bitmap, index, true);
  const {
    result: compressed,
    lastEliasGammaStartBit,
    maxIndex,
  } = compressBitmapArray(newBitmap);
  return {
    compressed: Buffer.from(compressed).toString("base64"),
    lastEliasGammaStartBit,
    maxIndex,
  };
}

function addIndexCompressed(
  compressedBase64,
  index,
  lastEliasGammaStartBit,
  maxIndex = -1,
) {
  if (maxIndex < 0 || index <= maxIndex) {
    return addIndexCompressedFull(compressedBase64, index);
  } else {
    return addIndexCompressedLast(
      compressedBase64,
      index,
      lastEliasGammaStartBit,
      maxIndex,
    );
  }
}

module.exports = {
  addIndexCompressed,
  decompressToBitmapArray,
  addIndexCompressedLast,
  addIndexCompressedFull,
  compressBitmapArray,
};
