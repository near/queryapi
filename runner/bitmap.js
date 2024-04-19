const fs = require("fs/promises");
const path = require("path");
const { Block } = require("@near-lake/primitives");

function bitmapToString(buffer) {
  console.log({ bitmapToString, buffer });
  return buffer.reduce((r, b) => r + b.toString(2).padStart(8, "0"), "");
}

// bit packing: converts array of indexes to a bitmap packed into Uint8Array
// example: [0,1,6] -> "11000010" -> [194]
function indexArrayToBitmap(arr) {
  console.log({ indexArrayToBitmap, arr });
  const lastItem = arr[arr.length - 1];
  return arr.reduce(
    (bytes, bit) => {
      bytes[Math.floor(bit / 8)] |= 1 << (7 - (bit % 8));
      return bytes;
    },
    new Uint8Array(Math.floor(lastItem / 8) + 2),
  );
}

// example: [0,1,6] -> "11000010"
function indexArrayToBitmapString(arr) {
  return bitmapToString(indexArrayToBitmap(arr));
}

// example: "0101" -> [1,3]
function bitmapStringToIndexArray(strBits) {
  console.log({ bitmapStringToIndexArray, strBits });
  const result = [];
  for (let i = 0; i < strBits.length; i++) {
    if (strBits[i] === "1") {
      result.push(i);
    }
  }
  return result;
}

function strBitmapToBitmap(strBits) {
  const bytes = new Uint8Array(Math.ceil(strBits.length / 8));
  for (let bit = 0; bit < strBits.length; bit++) {
    if (strBits[bit] === "1") {
      bytes[Math.floor(bit / 8)] |= 1 << (7 - (bit % 8));
    }
  }
  return bytes;
}

// computes Elias gamma coding for number x. Returns a string.
// Examples: https://en.wikipedia.org/wiki/Elias_gamma_coding
function eliasGamma(x) {
  if (x === 0) return "";
  if (x === 1) return "1";
  const N = Math.floor(Math.log2(x));
  const encN = "1".padStart(N + 1, "0");
  const encRemainer = (x - 2 ** N).toString(2).padStart(N, "0");
  return encN + encRemainer;
}

// returns first number x and corresponding coded string length of the first occurrence of
// Elias gamma coding. E.g. for "0101" returns {x:2,len:3}
function decodeEliasGammaFirstEntry(strBits) {
  if (strBits === "") return { x: 0, len: 0 };
  const N = strBits.indexOf("1");
  if (N < 0) {
    return { x: 0, len: strBits.length };
  }
  const remainder = strBits.slice(N + 1, 2 * N + 1);
  return { x: 2 ** N + (parseInt(remainder, 2) || 0), len: 2 * N + 1 };
}

// stores first char (0 or 1) and then repeats alternating repeating sequences using Elias gamma coding
// pads the resulting string at the end with '0's for length to be divisible by 8
function compressBitmapString(strBit) {
  let target = strBit[0];
  let result = target;
  let targetLen = 0;
  for (let i = 0; i < strBit.length; i++) {
    if (strBit[i] === target) {
      targetLen++;
    } else {
      result += eliasGamma(targetLen);
      target = target === "0" ? "1" : "0";
      targetLen = 1;
    }
  }
  result += eliasGamma(targetLen);
  return result.padEnd(Math.ceil(result.length / 8) * 8, "0");
}

function decompressBitmapString(compressedStrBit) {
  let target = compressedStrBit[0];
  let result = "";
  let remainder = compressedStrBit.slice(1);
  while (remainder.length) {
    const { x, len } = decodeEliasGammaFirstEntry(remainder);
    result += target.repeat(x);
    target = target === "0" ? "1" : "0";
    remainder = remainder.slice(len);
    if (len === 0) break; // we won't find any Elias gamma here, exiting
  }
  return result;
}

function decompressBase64(compressedBase64) {
  if (!compressedBase64 || compressedBase64 === "") {
    return new Uint8Array(0);
  }
  const bitmap = bitmapToString(Buffer.from(compressedBase64, "base64"));
  return decompressBitmapString(bitmap);
}

function indexArrayFromCompressedBase64(compressedBase64) {
  const decompressedBase64 = decompressBase64(compressedBase64);
  return bitmapStringToIndexArray(decompressedBase64);
}

function addIndexCompressed(compressedBase64, index) {
  console.log({ addIndexCompressed, compressedBase64, index });
  const decompressedBase64 = decompressBase64(compressedBase64);
  const strBits = bitmapToString(
    indexArrayToBitmap([
      ...bitmapStringToIndexArray(decompressedBase64),
      index,
    ]),
  );
  const compressed = compressBitmapString(strBits);
  return Buffer.from(strBitmapToBitmap(compressed)).toString("base64");
}

async function main() {
  const blockBuffer = await fs.readFile(
    path.join(__dirname, "./tests/blocks/00115185108/streamer_message.json"),
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
  console.log(
    `SELECT * FROM "actions_index" WHERE block_date='${blockDate}' AND receiver_id IN (${allReceivers
      .map((r) => `'${r}'`)
      .join(",")})`,
  );
  const currIndexes = [];
  // (await context.db.ActionsIndex.select({
  //   block_date: blockDate,
  //   receiver_id: allReceivers,
  // })) ?? [];
  console.log("currIndexes", JSON.stringify(currIndexes));

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

  console.log({ allReceivers, currIndexes }, allReceivers.length);
  const upserts = allReceivers.map((receiverId) => {
    const currentIndex = currIndexes.find((i) => i.receiver_id === receiverId);

    const blockDiff =
      block.blockHeight - (currentIndex?.first_block_height ?? 0);

    // This is the bit that takes the most time
    const p = performance.now();
    const newBitmap = addIndexCompressed(currentIndex?.bitmap ?? "", blockDiff);
    console.log(performance.now() - p, "ms")
    return {
      first_block_height: currentIndex?.first_block_height ?? block.blockHeight,
      block_date: blockDate,
      receiver_id: receiverId,
      bitmap: newBitmap,
    };
  });
  console.log("upserts", JSON.stringify(upserts));
  await context.db.ActionsIndex.upsert(
    upserts,
    ["block_date", "receiver_id"],
    ["bitmap"],
  );
}

main();
