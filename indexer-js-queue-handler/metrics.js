import AWS from "aws-sdk";

export default class Metrics {
    constructor(namespace, cloudwatch) {
        this.cloudwatch =
            cloudwatch || new AWS.CloudWatch({ region: process.env.AWS_REGION });
        this.namespace = namespace;
    }

    putBlockHeight(accountId, functionName, height) {
        return this.cloudwatch
            .putMetricData({
                MetricData: [
                    {
                        MetricName: "INDEXER_FUNCTION_LATEST_BLOCK_HEIGHT",
                        Dimensions: [
                            {
                                Name: "ACCOUNT_ID",
                                Value: accountId,
                            },
                            {
                                Name: "FUNCTION_NAME",
                                Value: functionName,
                            },
                        ],
                        Unit: "None",
                        Value: height,
                    },
                ],
                Namespace: this.namespace,
            })
            .promise();
    }
}
