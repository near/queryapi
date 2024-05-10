const fs = require("fs/promises");
const path = require("path");
const { Block } = require("@near-lake/primitives");
const {performance} = require("node:perf_hooks");

// Testing functions start here
function bitmapToString(buffer) {
  return buffer.reduce((r, b) => r + b.toString(2).padStart(8, "0"), "");
}

// bit packing: converts array of indexes to a bitmap packed into Uint8Array
// example: [0,1,6] -> "11000010" -> [194]
function indexArrayToBitmap(arr) {
  const lastItem = arr[arr.length - 1];
  return arr.reduce((bytes, idx) => {
      bytes[Math.floor(idx / 8)] |= 1 << (7 - idx % 8);
      return bytes;
  }, new Uint8Array(Math.floor(lastItem / 8) + 1));
}

// example: [0,1,6] -> "11000010"
function indexArrayToBitmapString(arr){
  return bitmapToString(indexArrayToBitmap(arr));
}

// example: "0101" -> [1,3]
function bitmapStringToIndexArray(strBits) {
  const result = [];
  for(let i = 0; i < strBits.length; i ++) {
      if (strBits[i] === '1') {
          result.push(i);
      }
  }
  return result;
}

function strBitmapToBitmap(strBits) {
  const bytes = new Uint8Array(Math.ceil(strBits.length / 8));
  for(let bit = 0; bit < strBits.length; bit ++) {
      if (strBits[bit] === '1') {
          bytes[Math.floor(bit / 8)] |= 1 << (7 - bit % 8);
      }
  }
  return bytes;
}

// Core functions start here
function indexOfFirstBitInByteArray (bytes, startBit) {
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

function setBitInBitmap (uint8Array, bit, bitValue = true) {
  if (!bitValue) return uint8Array;
  const newLen = ~~(bit / 8) + 1;
  let result = uint8Array;
  if (uint8Array.length < newLen) {
    result = new Uint8Array(new ArrayBuffer(newLen));
    result.set(uint8Array);
  }
  result[~~(bit / 8)] |= 1 << (7 - (bit % 8));
  return result;
}

function getBitInByteArray (bytes, bitIndex) {
  const b = ~~(bitIndex / 8);
  const bi = bitIndex % 8;
  return (bytes[b] & (1 << (7 - bi))) > 0;
}

// takes numbers between [start, end] bits inclusive in byte array and
// returns decimal number they represent
function getNumberBetweenBits (bytes, start, end) {
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
function writeEliasGammaBits (x, result, startBit) {
  if (x === 0) return { bit: startBit, result };
  if (x === 1) {
    setBitInBitmap(result, startBit);
    return { bit: startBit + 1, result };
  }
  let bit = startBit;
  const N = ~~(Math.log2(x));
  const remainder = x - 2 ** N;
  bit += N;
  result = setBitInBitmap(result, bit++);
  for (let ri = 0; ri < N; ri++, bit++) {
    if (remainder & (1 << (N - 1 - ri))) {
      result = setBitInBitmap(result, bit);
    }
  }
  return { bit, result };
}

// stores first char (0 or 1) and then repeats alternating repeating sequences using Elias gamma coding
// pads the resulting string at the end with '0's for length to be divisible by 8
function compressBitmapArray (uint8Array) {
  let curBit = (uint8Array[0] & 0b10000000) > 0;
  let curBitStretch = 0;
  const resultBuffer = new ArrayBuffer(12000);
  let result = new Uint8Array(resultBuffer);
  let nextBit = 0;
  result = setBitInBitmap(result, nextBit++, curBit);
  for (let ibit = 0; ibit < uint8Array.length * 8; ibit++) {
    if (getBitInByteArray(uint8Array, ibit) === curBit) {
      curBitStretch++;
    } else {
      const w = writeEliasGammaBits(curBitStretch, result, nextBit);
      nextBit = w.bit;
      result = w.result;
      curBit = !curBit;
      curBitStretch = 1;
    }
  }
  const w = writeEliasGammaBits(curBitStretch, result, nextBit);
  nextBit = w.bit;
  result = w.result.slice(0, ((nextBit / 8) + 1) >> 0);
  return result;
}

// Returns first number x and corresponding coded bits length of the first occurrence of Elias gamma coding
function decodeEliasGammaFirstEntryFromBytes (bytes, startBit = 0) {
  if (!bytes || bytes.length === 0) return { x: 0, lastBit: 0 };
  const idx = indexOfFirstBitInByteArray(bytes, startBit);
  if (idx < 0) {
    return { x: 0, len: bytes.length * 8 };
  }
  const N = idx - startBit;
  const remainder = N === 0 ? 0 : getNumberBetweenBits(bytes, idx + 1, idx + N);
  return { x: 2 ** N + remainder, lastBit: idx + N };
}

// Decompresses Elias-gamma coded bytes to Uint8Array
function decompressToBitmapArray (compressedBytes) {
  const decompressTotalTimer = performance.now();
  const variableInitTimer = performance.now();
  const compressedBitLength = compressedBytes.length * 8;
  let curBit = (compressedBytes[0] & 0b10000000) > 0;
  const buffer = new ArrayBuffer(11000);
  const result = new Uint8Array(buffer);
  let compressedBitIdx = 1;
  let resultBitIdx = 0;
  let [ decodeEliasGammaCumulativeMs, longestDecodeEliasGammaMs, settingRemainderCumulativeMs, longestSettingRemainderMs, decodingLoopMs, decodeCount ] = [0,0,0,0,0,0];
  const variableInitMs = performance.now() - variableInitTimer;
  while (compressedBitIdx < compressedBitLength) {
    const decodeEliasGammaTimer = performance.now();
    // Get x, the number of bits to set, and lastBit, the bit number which is the last bit of the Elias gamma coding
    const { x, lastBit } = decodeEliasGammaFirstEntryFromBytes(
      compressedBytes,
      compressedBitIdx
    );
    decodeEliasGammaCumulativeMs += performance.now() - decodeEliasGammaTimer;
    // longestDecodeEliasGammaMs = Math.max(longestDecodeEliasGammaMs, performance.now() - decodeEliasGammaTimer);
    const settingRemainderTimer = performance.now();
    compressedBitIdx = lastBit + 1; // Ensure next loop starts on next bit
    // If x is large, we can set by byte instead of bit
    for (let i = 0; curBit && i < x; i++) { // Specifically if curBit is 1, set next x bits to 1
      setBitInBitmap(result, resultBitIdx + i);
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
  console.log(`decompressTotalMs=${decompressTotalMs}, variableInitMs=${variableInitMs}, decodingLoopMs=${decodingLoopMs}, decodeCount=${decodeCount}`);
  // console.log(`decodeEliasGammaCumulativeMs=${decodeEliasGammaCumulativeMs}, longestDecodeEliasGammaMs=${longestDecodeEliasGammaMs}, settingRemainderCumulativeMs=${settingRemainderCumulativeMs}, longestSettingRemainderMs=${longestSettingRemainderMs}`);
  return result.subarray(0, bufferLength);
}

function addIndexCompressed (compressedBase64, index) {
  const b = performance.now();
  const buf = Buffer.from(compressedBase64, 'base64');
  const bufferMs = performance.now() - b;
  const d = performance.now();
  const bitmap = decompressToBitmapArray(
    buf
  );
  const decompressMs = performance.now() - d;
  const s = performance.now();
  const newBitmap = setBitInBitmap(bitmap, index);
  const setsMs = performance.now() - s;
  const c = performance.now();
  const compressed = compressBitmapArray(newBitmap);
  const compMs = performance.now() - c;
  console.log(`bufferMs=${bufferMs}, decompressMs=${decompressMs}, setsMs=${setsMs}, compMs=${compMs}`)
  return Buffer.from(compressed).toString('base64');
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
}`
function fetchGraphQL(operationsDoc, operationName, variables) {
  return fetch(
      QUERYAPI_ENDPOINT,
      {
        method: "POST",
        headers: { "x-hasura-role": `nearpavel_near`, 'Content-Type': 'application/json', },
        body: JSON.stringify({
          query: operationsDoc,
          // variables: variables,
          // operationName: operationName,
        }),
      }
  );
}

async function getReceivers(receivers, blockDate) {
  return await fetchGraphQL(query(receivers, blockDate), "AccountIdByPublicKey", {})
      .then(async (result) => {
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
          console.error(result)
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
  const upserts = allReceivers.filter((receiverId) => receiverId === 'app.nearcrowd.near').map((receiverId) => {
    const currentIndex = currIndexes.find((i) => i?.receiver_id === receiverId);
    const blockIndexInCurrentBitmap = currentIndex?.first_block_height
        ? block.blockHeight - currentIndex?.first_block_height
        : 0;
    //console.log(`${currentIndex?.first_block_height ?? 0} ${block.blockHeight}: currentIndex?.first_block_height: ${currentIndex?.first_block_height}, blockIndexInCurrentBitmap: ${blockIndexInCurrentBitmap}`)
    console.log('receiverId', receiverId);
    const newBitmap = addIndexCompressed(
        currentIndex?.bitmap ?? "",
        blockIndexInCurrentBitmap
    );
    return {
      first_block_height: currentIndex?.first_block_height ?? block.blockHeight,
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
      }ms; total time ${endTime - startTime}ms`
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
  bitmapStringToIndexArray,
  indexArrayToBitmap,
  strBitmapToBitmap,
  bitmapToString
}