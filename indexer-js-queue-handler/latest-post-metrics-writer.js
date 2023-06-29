import fetch from "node-fetch";
import AWS from "aws-sdk";

import Metrics from './metrics.js'

export const handler = async () => {
    const metrics = new Metrics("QueryAPI");

    const response = await fetch("https://api.near.social/index", {
        method: "POST",
        body: JSON.stringify({
            action: "post",
            key: "main",
            options: {
                limit: 1,
                order: "desc",
            },
        }),
    });

    const body = await response.text();

    if (response.status !== 200) {
      throw new Error(body);
    }

    const [{ blockHeight }] = JSON.parse(body);

    await metrics.putBlockHeight("social.near", "posts", blockHeight);
};
