const fs = require("fs/promises");
const path = require("path");
const { Block } = require("@near-lake/primitives");
const { performance } = require("node:perf_hooks");

// Core functions start here
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

function setBitInBitmap(uint8Array, bitIndex, bitValue, writeZero = false) {
  const newLen = ~~(bitIndex / 8) + 1;
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

function getBitInByteArray(bytes, bitIndex) {
  const b = ~~(bitIndex / 8);
  const bi = bitIndex % 8;
  return (bytes[b] & (1 << (7 - bi))) > 0;
}

// takes numbers between [start, end] bits inclusive in byte array and
// returns decimal number they represent
function getNumberBetweenBits(bytes, start, end) {
  const len = end - start + 1;
  let result = 0;
  for (let i = start, rbit = 0; i <= end; i++, rbit++) {
    if (getBitInByteArray(bytes, i)) {
      result |= 1 << (len - 1 - rbit);
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
  result = setBitInBitmap(result, nextBit++, true, writeZeros);
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

  result = setBitInBitmap(result, nextBit++, curBit);
  let lastEliasGammaStartBit = nextBit;
  let ibit = 0;
  for (; ibit < uint8Array.length * 8; ibit++) {
    if (getBitInByteArray(uint8Array, ibit) === curBit) {
      curBitStretch++;
    } else {
      maxIndex = curBit ? ibit - 1 : maxIndex;
      const w = writeEliasGammaBits(curBitStretch, result, nextBit);
      nextBit = w.nextBit;
      result = w.result;
      curBit = !curBit;
      lastEliasGammaStartBit = curBit ? nextBit : lastEliasGammaStartBit;
      curBitStretch = 1;
    }
  }
  maxIndex = curBit ? ibit - 1 : maxIndex;
  const w = writeEliasGammaBits(curBitStretch, result, nextBit);
  nextBit = w.nextBit;
  result = w.result.slice(0, Math.ceil(nextBit / 8));
  return {
    result,
    lastEliasGammaStartBit,
    lastEliasGammaBitValue: curBit,
    maxIndex,
  };
}

// Returns first number x and corresponding coded bits length of the first occurrence of Elias gamma coding
function decodeEliasGammaFirstEntryFromBytes(bytes, startBit = 0) {
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
  const decompressTotalTimer = performance.now();
  const variableInitTimer = performance.now();
  const compressedBitLength = compressedBytes.length * 8;
  let curBit = (compressedBytes[0] & 0b10000000) > 0;
  const buffer = new ArrayBuffer(11000);
  const result = new Uint8Array(buffer);
  let compressedBitIdx = 1;
  let resultBitIdx = 0;
  let [
    decodeEliasGammaCumulativeMs,
    longestDecodeEliasGammaMs,
    settingRemainderCumulativeMs,
    longestSettingRemainderMs,
    decodingLoopMs,
    decodeCount,
  ] = [0, 0, 0, 0, 0, 0];
  const variableInitMs = performance.now() - variableInitTimer;
  while (compressedBitIdx < compressedBitLength) {
    const decodeEliasGammaTimer = performance.now();
    // Get x, the number of bits to set, and lastBit, the bit number which is the last bit of the Elias gamma coding
    const { x, lastBit } = decodeEliasGammaFirstEntryFromBytes(
      compressedBytes,
      compressedBitIdx,
    );
    decodeEliasGammaCumulativeMs += performance.now() - decodeEliasGammaTimer;
    // longestDecodeEliasGammaMs = Math.max(longestDecodeEliasGammaMs, performance.now() - decodeEliasGammaTimer);
    const settingRemainderTimer = performance.now();
    compressedBitIdx = lastBit + 1; // Ensure next loop starts on next bit
    // If x is large, we can set by byte instead of bit
    for (let i = 0; curBit && i < x; i++) {
      // Specifically if curBit is 1, set next x bits to 1
      setBitInBitmap(result, resultBitIdx + i, true);
    }
    resultBitIdx += x;
    curBit = !curBit; // Switch currBit for next iteration (counting 1s, then 0s, then 1s, etc.)
    settingRemainderCumulativeMs += performance.now() - settingRemainderTimer;
    // longestSettingRemainderMs = Math.max(longestSettingRemainderMs, performance.now() - settingRemainderTimer);
    decodingLoopMs += performance.now() - decodeEliasGammaTimer;
    decodeCount++;
    if (x === 0) break; // we won't find any Elias gamma here, exiting
  }
  let bufferLength = Math.ceil(resultBitIdx / 8);
  const decompressTotalMs = performance.now() - decompressTotalTimer;
  // console.log(`compression ratio=${compressedBytes.length / (bufferLength)}, compressedLength=${compressedBytes.length}, bufferLength=${bufferLength}`);
  if (decompressTotalMs)
    console.log(
      `decompressTotalMs=${decompressTotalMs}, variableInitMs=${variableInitMs}, decodingLoopMs=${decodingLoopMs}, decodeCount=${decodeCount}`,
    );
  // console.log(`decodeEliasGammaCumulativeMs=${decodeEliasGammaCumulativeMs}, longestDecodeEliasGammaMs=${longestDecodeEliasGammaMs}, settingRemainderCumulativeMs=${settingRemainderCumulativeMs}, longestSettingRemainderMs=${longestSettingRemainderMs}`);
  return result.subarray(0, bufferLength);
}

function addIndexCompressedLast(
  compressedBase64,
  index,
  lastEliasGammaStartBit,
  maxIndex,
) {
  const originalCompressed = Buffer.from(compressedBase64, "base64");
  const resultBuffer = new Buffer(12000);
  originalCompressed.copy(resultBuffer);
  let result = new Uint8Array(resultBuffer);
  // decompress the last EG section
  const { x, lastBit } = decodeEliasGammaFirstEntryFromBytes(
    originalCompressed,
    lastEliasGammaStartBit,
  );
  let curBit = true;
  let curBitStretch = x;
  let nextBit = lastEliasGammaStartBit;
  // set index bit in it
  if (index - maxIndex === 1) {
    // write increased stretch of 1s
    let cursor = writeEliasGammaBits(curBitStretch + 1, result, nextBit, true);
    // write remaining zeros
    const remainingZeros = Math.ceil(index / 8) * 8 - index - 1;
    cursor = writeEliasGammaBits(
      remainingZeros,
      cursor.result,
      cursor.nextBit,
      true,
    );
    const len = Math.ceil(cursor.nextBit / 8);
    const bufferLen =
      len > originalCompressed.length ? len : originalCompressed.length;
    return {
      compressed: Buffer.from(cursor.result.slice(0, bufferLen)).toString(
        "base64",
      ),
      lastEliasGammaStartBit,
    };
  } else if (index - maxIndex > 1) {
    // write eg back
    let cursor = writeEliasGammaBits(curBitStretch, result, nextBit, true);
    // write zeros
    const zeros = index - maxIndex - 1;
    cursor = writeEliasGammaBits(zeros, cursor.result, cursor.nextBit, true);
    // write 1 for the `index` bit
    result = setBitInBitmap(cursor.result, cursor.nextBit, true);
    nextBit = cursor.nextBit + 1;
    // write remaining zeros
    const remainingZeros = Math.ceil(nextBit / 8) * 8 - nextBit;
    cursor = writeEliasGammaBits(
      remainingZeros,
      cursor.result,
      cursor.nextBit,
      true,
    );
    return {
      compressed: Buffer.from(
        result.slice(0, Math.ceil((cursor.nextBit + 1) / 8) + 1),
      ).toString("base64"),
      lastEliasGammaStartBit: nextBit,
    };
  } else {
    throw Error(``);
  }
}

function addIndexCompressed(compressedBase64, index) {
  const b = performance.now();
  const buf = Buffer.from(compressedBase64, "base64");
  const bufferMs = performance.now() - b;
  const d = performance.now();
  const bitmap = decompressToBitmapArray(buf);
  const decompressMs = performance.now() - d;
  const s = performance.now();
  const newBitmap = setBitInBitmap(bitmap, index, true);
  const setsMs = performance.now() - s;
  const c = performance.now();
  const {
    result: compressed,
    lastEliasGammaStartBit,
    lastEliasGammaBitValue,
    maxIndex,
  } = compressBitmapArray(newBitmap);
  const compMs = performance.now() - c;
  console.log(
    `bufferMs=${bufferMs}, decompressMs=${decompressMs}, setsMs=${setsMs}, compMs=${compMs}`,
  );
  return {
    compressed: Buffer.from(compressed).toString("base64"),
    lastEliasGammaStartBit,
    lastEliasGammaBitValue,
    maxIndex,
  };
}

const QUERYAPI_ENDPOINT = `https://near-queryapi.dev.api.pagoda.co/v1/graphql`;

const query = (receivers, blockDate) => `query Bitmaps {
nearpavel_near_bitmap_v2_actions_index(
    where: {block_date: {_eq: "${blockDate}"}, receiver_id: {_in: ${JSON.stringify(receivers)}}}
  ) {
    block_date
    bitmap
    first_block_height
    receiver_id
  }
}`;
function fetchGraphQL(operationsDoc, operationName, variables) {
  return fetch(QUERYAPI_ENDPOINT, {
    method: "POST",
    headers: {
      "x-hasura-role": `nearpavel_near`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: operationsDoc,
      // variables: variables,
      // operationName: operationName,
    }),
  });
}

async function getReceivers(receivers, blockDate) {
  return await fetchGraphQL(
    query(receivers, blockDate),
    "AccountIdByPublicKey",
    {},
  ).then(async (result) => {
    if (result.status === 200) {
      const json = await result.json();
      if (json.data) {
        return json.data.nearpavel_near_bitmap_v2_actions_index;
      }
      if (json.errors) {
        const data = json.errors.nearpavel_near_bitmap_v2_actions_index;
        console.error(data);
      }
    } else {
      console.error(result);
    }
  });
}

async function main() {
  const blockBuffer = await fs.readFile(
    path.join(__dirname, "./tests/blocks/00115667764/streamer_message.json"),
  );
  const block = Block.fromStreamerMessage(JSON.parse(blockBuffer.toString()));

  const blockDate = new Date(
    block.streamerMessage.block.header.timestamp / 1000000,
  )
    .toISOString()
    .substring(0, 10);

  const actionsByReceiver = block.actions().reduce((groups, action) => {
    (groups[action.receiverId] ||= []).push(action);
    return groups;
  }, {});

  const allReceivers = Object.keys(actionsByReceiver);
  console.log(`There are ${allReceivers.length} receivers in this block.`);
  const currIndexes = await getReceivers(allReceivers, blockDate);
  const startTime = Date.now();

  const startTimeR = Date.now();
  const upserts = allReceivers
    .filter((receiverId) => receiverId === "app.nearcrowd.near")
    .map((receiverId) => {
      const currentIndex = currIndexes.find(
        (i) => i?.receiver_id === receiverId,
      );
      const blockIndexInCurrentBitmap = currentIndex?.first_block_height
        ? block.blockHeight - currentIndex?.first_block_height
        : 0;
      //console.log(`${currentIndex?.first_block_height ?? 0} ${block.blockHeight}: currentIndex?.first_block_height: ${currentIndex?.first_block_height}, blockIndexInCurrentBitmap: ${blockIndexInCurrentBitmap}`)
      console.log("receiverId", receiverId);
      const { compressed: newBitmap } = addIndexCompressed(
        currentIndex?.bitmap ?? "",
        blockIndexInCurrentBitmap,
      );
      return {
        first_block_height:
          currentIndex?.first_block_height ?? block.blockHeight,
        block_date: blockDate,
        receiver_id: receiverId,
        bitmap: newBitmap,
      };
    });
  const endTimeR = Date.now();
  const endTime = Date.now();
  console.log(
    `Computing bitmaps for ${allReceivers.length} receivers took ${
      endTimeR - startTimeR
    }ms; total time ${endTime - startTime}ms`,
  );
  //console.log("upserts", JSON.stringify(upserts));
  // await context.db.ActionsIndex.upsert(
  //     upserts,
  //     ["block_date", "receiver_id"],
  //     ["bitmap"],
  // );
}

module.exports = {
  addIndexCompressed,
  decompressToBitmapArray,
  addIndexCompressedLast,
};
