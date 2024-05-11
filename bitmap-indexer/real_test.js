const fs = require("fs/promises");
const path = require("path");
const { Block } = require("@near-lake/primitives");
const {
  addIndexCompressed,
  decompressToBitmapArray,
  addIndexCompressedLast,
  compressBitmapArray,
} = require("./bitmap");
const { performance } = require("node:perf_hooks");

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

function fillMaxIndex(dbBitmap) {
  const buf = Buffer.from(dbBitmap.bitmap, "base64");
  const bitmap = decompressToBitmapArray(buf);
  const {
    result: compressed,
    lastEliasGammaStartBit,
    maxIndex,
  } = compressBitmapArray(bitmap);
  return {
    ...dbBitmap,
    lastEliasGammaStartBit,
    maxIndex,
  };
}

async function main() {
  const blockBuffer = await fs.readFile(
    path.join(
      __dirname,
      "../runner/tests/blocks/00115667764/streamer_message.json",
    ),
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
  const currIndexes = (await getReceivers(allReceivers, blockDate)).map((b) =>
    fillMaxIndex(b),
  );
  const startTime = Date.now();

  const startTimeR = Date.now();
  const upserts = allReceivers
    //.filter((receiverId) => receiverId === "app.nearcrowd.near")
    .map((receiverId) => {
      const currentIndex = currIndexes.find(
        (i) => i?.receiver_id === receiverId,
      );
      const blockIndexInCurrentBitmap = currentIndex?.first_block_height
        ? block.blockHeight - currentIndex?.first_block_height
        : 0;
      //console.log(`${currentIndex?.first_block_height ?? 0} ${block.blockHeight}: currentIndex?.first_block_height: ${currentIndex?.first_block_height}, blockIndexInCurrentBitmap: ${blockIndexInCurrentBitmap}`)
      //console.log("receiverId", receiverId);
      const { compressed: newBitmap } = addIndexCompressed(
        currentIndex?.bitmap ?? "",
        blockIndexInCurrentBitmap + 5000,
        currentIndex.lastEliasGammaStartBit,
        currentIndex.maxIndex,
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

(() => main())();
