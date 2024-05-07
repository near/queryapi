const fs = require("fs/promises");
const path = require("path");
const { Block } = require("@near-lake/primitives");
const {performance} = require("node:perf_hooks");

const BITS = new Uint8Array([128,64,32,16,8,4,2,1]);

function indexOfFirstBitInByteArray(bytes, startBit) {
  let firstBit = startBit % 8;
  for (let iByte = Math.floor(startBit / 8); iByte < bytes.length; iByte++) {
    if (bytes[iByte] > 0) {
      for (let iBit= firstBit; iBit <= 7; iBit++) {
        if (bytes[iByte] & BITS[iBit]) {
          return iByte * 8 + iBit;
        }
      }
    }
    firstBit = 0;
  }
  return -1;
}

function setBitInBitmap(uint8Array, bit, bitValue = true) {
  if (!bitValue) return uint8Array;
  const newLen = Math.floor(bit / 8) + 1;
  let result = uint8Array;
  if (uint8Array.length < newLen) {
    console.log(`Resize from ${uint8Array.length} to ${newLen}`)
    result = new Uint8Array(new ArrayBuffer(newLen));
    result.set(uint8Array);
  }
  //uint8Array.buffer.resize(newLen);
  result[Math.floor(bit / 8)] |= BITS[bit % 8];
  return result;
}

function getBitInByteArray(bytes, bitIndex) {
  return (bytes[Math.floor(bitIndex / 8)] & BITS[bitIndex % 8]) > 0;
}

// takes numbers between [start, end] bits inclusive in byte array and
// returns decimal number they represent
function getNumberBetweenBits(bytes, start, end) {
  const len = end - start + 1;
  let r = 0;
  for (let i = start, rbit = 0; i <= end; i++, rbit++) {
    if (getBitInByteArray(bytes, i)) {
      r |= 1 << (len - 1 - rbit);
    }
  }
  return r;
}

// Writes Elias gamma coding bits for number x into result bytes array starting with index startBit.
// Returns index of the next bit after the coding.
// Examples: https://en.wikipedia.org/wiki/Elias_gamma_coding
function writeEliasGammaBits(x, result, startBit) {
  if (x === 0) return {bit: startBit, result};
  if (x === 1) {
    setBitInBitmap(result, startBit);
    return {bit: startBit + 1, result};
  }
  let bit = startBit;
  const N = Math.floor(Math.log2(x));
  const remainder = x - 2 ** N;
  bit += N;
  result = setBitInBitmap(result, bit++);
  for (let ri = 0; ri < N; ri++, bit++) {
    if (remainder & (1 << (N - 1 - ri))) {
      result = setBitInBitmap(result, bit);
    }
  }
  return {bit, result};
}

// stores first char (0 or 1) and then repeats alternating repeating sequences using Elias gamma coding
// pads the resulting string at the end with '0's for length to be divisible by 8
function compressBitmapArray(uint8Array) {
  const p = performance.now();
  let curBit = (uint8Array[0] & 128) > 0;
  let curBitStretch = 0;
  let resultBuffer = new ArrayBuffer(12000);
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
  result = w.result.slice(0, Math.ceil(nextBit / 8))
  return result;
}

// Returns first number x and corresponding coded bits length of the first occurrence of Elias gamma coding
function decodeEliasGammaFirstEntryFromBytes(bytes, startBit = 0) {
  if (!bytes || bytes.length === 0) return { x: 0, lastBit: 0 };
  const idx = indexOfFirstBitInByteArray(bytes, startBit);
  if (idx < 0) {
    return { x: 0, len: bytes.length * 8 };
  }
  const N = idx - startBit;
  const remainder = getNumberBetweenBits(bytes, idx + 1, idx + N);
  return { x: 2 ** N + remainder, lastBit: idx + N };
}

// Decompresses Elias-gamma coded bytes to Uint8Array
function decompressToBitmapArray(compressedBytes) {
  let curBit = (compressedBytes[0] & 0x80) > 0;
  const buffer = new ArrayBuffer(12000);
  let bufferLength = 0;
  let result = new Uint8Array(buffer);
  let compressedBitIdx = 1;
  let nextBitIdx = 0;
  while (compressedBitIdx < compressedBytes.length * 8) {
    const { x, lastBit } = decodeEliasGammaFirstEntryFromBytes(
        compressedBytes,
        compressedBitIdx
    );
    compressedBitIdx = lastBit + 1;
    if (bufferLength * 8 < nextBitIdx + x) {
      bufferLength = Math.ceil((nextBitIdx + x) / 8);
    }
    for (let i = 0; curBit && i < x; i++) {
      result = setBitInBitmap(result, nextBitIdx + i);
    }
    nextBitIdx += x;
    curBit = !curBit;
    if (x === 0) break; // we won't find any Elias gamma here, exiting
  }
  return {result: result, length: bufferLength};
}

function addIndexCompressed(compressedBase64, index) {
  const d = performance.now();
  const {result: bitmap, length} = decompressToBitmapArray(
      Buffer.from(compressedBase64, "base64")
  );
  const decompressMs = performance.now() - d;
  const s = performance.now();
  const newBitmap = setBitInBitmap(bitmap, index);
  const indexByte = Math.floor(index / 8);
  const newBitmapLen = indexByte + 1 > length ? indexByte + 1 : length;
  const setsMs = performance.now() - s;
  const c = performance.now();
  const compressed = compressBitmapArray(newBitmap, newBitmapLen);
  const compMs = performance.now() - c;
  console.log(`[${compressedBase64.length}] decompressMs=${decompressMs}, setsMs=${setsMs}, compMs=${compMs}`)
  return Buffer.from(compressed).toString("base64");
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
      path.join(__dirname, "./tests/blocks/00115598802/streamer_message.json"),
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
  // console.log(
  //     `SELECT * FROM "actions_index" WHERE block_date='${blockDate}' AND receiver_id IN (${allReceivers
  //         .map((r) => `'${r}'`)
  //         .join(",")})`,
  // );
  const currIndexes = await getReceivers(allReceivers, blockDate);
  const startTime = Date.now();
  // (await context.db.ActionsIndex.select({
  //   block_date: blockDate,
  //   receiver_id: allReceivers,
  // })) ?? [];
  //console.log("currIndexes", JSON.stringify(currIndexes));

  // await Promise.all(
  //   allReceivers.map(async (receiverId) => {
  //     const currentIndex = await context.db.ActionsIndex.select(
  //       {
  //         block_date: blockDate,
  //         receiver_id: receiverId,
  //       },
  //       1
  //     );
  //     return {
  //       receiverId,
  //       currentIndex: currentIndex ? currentIndex[0] : null,
  //     };
  //   })
  // );

  const startTimeR = Date.now();
  const upserts = allReceivers.map((receiverId) => {
    const currentIndex = currIndexes.find((i) => i?.receiver_id === receiverId);
    const blockIndexInCurrentBitmap = currentIndex?.first_block_height
        ? block.blockHeight - currentIndex?.first_block_height
        : 0;
    //console.log(`${currentIndex?.first_block_height ?? 0} ${block.blockHeight}: currentIndex?.first_block_height: ${currentIndex?.first_block_height}, blockIndexInCurrentBitmap: ${blockIndexInCurrentBitmap}`)
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

main();