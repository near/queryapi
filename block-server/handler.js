'use strict';
import { S3 } from '@aws-sdk/client-s3';
const S3 = new S3();

const NETWORK = process.env.NETWORK || 'mainnet';

module.exports.block = async (event) => {
  let headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Credentials": true,
  };

  try {
    // parse request params
    const { block_height } = event.pathParameters;
    const options = event.queryStringParameters || {};
    options.snake_case = options.snake_case === 'true';
    const block = await fetchStreamerMessage(block_height, options);
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

const fetchStreamerMessage = async function(block_height, options) {
    const block = await fetchBlockPromise(block_height, options);
    const shards = await Promise.all(fetchShardsPromises(block_height, block.chunks.length, options))

    return {
        block,
        shards,
    };
}

const fetchShardsPromises = function(block_height, number_of_shards, options) {
    return ([...Array(number_of_shards).keys()].map((shard_id) =>
        fetchShardPromise(block_height, shard_id, options)));
}

const fetchShardPromise = function(block_height, shard_id, options) {
    const params = {
        Bucket: `near-lake-data-${NETWORK}`,
        Key: `${normalizeBlockHeight(block_height)}/shard_${shard_id}.json`,
    };
    return S3.getObject(params).promise().then((response) => {
        return JSON.parse(response.Body.toString(), (key, value) => {
            if(options.snake_case) return value
            return renameUnderscoreFieldsToCamelCase(value)
        });
    });
}

const fetchBlockPromise = function(block_height, options) {
    const file = 'block.json';
    const folder = normalizeBlockHeight(block_height);
    const params = {
        Bucket: 'near-lake-data-' + NETWORK,
        Key: `${folder}/${file}`,
    };
    return S3.getObject(params).promise().then((response) => {
        const block = JSON.parse(response.Body.toString(), (key, value) => {
            if(options.snake_case) return value
            return renameUnderscoreFieldsToCamelCase(value)
        });

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
