import fetch from "node-fetch";
import AWS from "aws-sdk";

import Metrics from "./metrics.js";

const fetchJson = async (url, requestBody, requestHeaders) => {
    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...requestHeaders,
        },
        body: JSON.stringify(requestBody),
    });

    const responseBody = await response.json();

    if (response.status !== 200 || responseBody.errors) {
        throw new Error(JSON.stringify(responseBody));
    }

    return responseBody;
};

export const handler = async () => {
    const metrics = new Metrics("QueryAPI");

    const [nearSocialResponse, feedIndexerResponse] = await Promise.all([
        fetchJson(`https://api.near.social/index`, {
            action: "post",
            key: "main",
            options: {
                limit: 1,
                order: "desc",
            },
        }),
        fetchJson(
            `${process.env.HASURA_ENDPOINT_V2}/v1/graphql`,
            {
                query: `{
                    dataplatform_near_social_feed_posts(
                        limit: 1,
                        order_by: { block_height: desc }
                    ) {
                        block_height
                    }
                }`,
            },
            {
                ["X-Hasura-Role"]: "dataplatform_near",
            }
        ),
    ]);

    const nearSocialBlockHeight = nearSocialResponse[0].blockHeight;
    const feedIndexerBlockHeight =
        feedIndexerResponse.data.dataplatform_near_social_feed_posts[0].block_height;

    const lag = nearSocialBlockHeight - feedIndexerBlockHeight;

    await metrics.putCustomMetric("dataplatform.near", "social_feed", false, 'SOCIAL_LAG', lag);
};
