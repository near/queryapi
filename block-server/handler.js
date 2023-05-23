'use strict';
const AWS = require('aws-sdk');
const S3= new AWS.S3();

const NETWORK = process.env.NETWORK || 'mainnet';
const allowedOrigins = ['https://queryapi-frontend-24ktefolwq-ew.a.run.app', 'https://queryapi-frontend-vcqilefdcq-ew.a.run.app', 'https://near.org', "https://near.social"];

module.exports.block = async (event) => {
  // Set CORS headers 
  const origin = event.headers.origin;
  let headers = {};
  if (allowedOrigins.includes(origin)) {
    headers = {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Credentials": true,
    };
  }

  try {
    // parse request params
    const { block_height } = event.pathParameters;
    const block = await fetchStreamerMessage(block_height);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(block)
    }
  } catch (err) {
    return {
      statusCode: err.statusCode || 400,
      headers,
      body: err.message || JSON.stringify(err.message)
    }
  }
};

const normalizeBlockHeight = function(block_height) {
    return block_height.toString().padStart(12, '0');
}

const fetchStreamerMessage = async function(block_height) {
    const blockPromise = fetchBlockPromise(block_height);
    // hardcoding 4 shards to test performance
    const shardsPromises = await fetchShardsPromises(block_height, 4); // block.chunks.length)

    const results = await Promise.all([blockPromise, ...shardsPromises]);
    const block = results.shift();
    const shards = results;
    return {
        block: block,
        shards: shards,
    };
}

const fetchShardsPromises = async function(block_height, number_of_shards) {
    return ([...Array(number_of_shards).keys()].map((shard_id) =>
        fetchShardPromise(block_height, shard_id)));
}

const fetchShardPromise = function(block_height, shard_id) {
    const params = {
        Bucket: `near-lake-data-${NETWORK}`,
        Key: `${normalizeBlockHeight(block_height)}/shard_${shard_id}.json`,
    };
    return S3.getObject(params).promise().then((response) => {
        return JSON.parse(response.Body.toString(), (key, value) => renameUnderscoreFieldsToCamelCase(value));
    });
}

const fetchBlockPromise = function(block_height) {
    const file = 'block.json';
    const folder = normalizeBlockHeight(block_height);
    const params = {
        Bucket: 'near-lake-data-' + NETWORK,
        Key: `${folder}/${file}`,
    };
    return S3.getObject(params).promise().then((response) => {
        const block = JSON.parse(response.Body.toString(), (key, value) => renameUnderscoreFieldsToCamelCase(value));
        return block;
    });
}
const renameUnderscoreFieldsToCamelCase = function(value) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
        // It's a non-null, non-array object, create a replacement with the keys initially-capped
        const newValue = {};
        for (const key in value) {
            const newKey = key
                .split("_")
                .map((word, i) => {
                    if (i > 0) {
                        return word.charAt(0).toUpperCase() + word.slice(1);
                    }
                    return word;
                })
                .join("");
            newValue[newKey] = value[key];
        }
        return newValue;
    }
    return value;
}
