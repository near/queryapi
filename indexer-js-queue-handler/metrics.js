import { CloudWatch } from "aws-sdk";

export default class Metrics {
    constructor(namespace, cloudwatch) {
        this.cloudwatch =
            cloudwatch || new CloudWatch({ region: process.env.REGION });
        this.namespace = namespace;
    }

    putBlockHeight(accountId, functionName, isHistorical, height) {
        return this.putCustomMetric(accountId, functionName, isHistorical, "INDEXER_FUNCTION_LATEST_BLOCK_HEIGHT", height);
    }

    putCustomMetric(accountId, functionName, isHistorical, metricName, value) {
        return this.cloudwatch
            .putMetricData({
                MetricData: [
                    {
                        MetricName: metricName,
                        Dimensions: [
                            {
                                Name: "ACCOUNT_ID",
                                Value: accountId,
                            },
                            {
                                Name: "FUNCTION_NAME",
                                Value: functionName,
                            },
                            {
                                Name: "STAGE",
                                Value: process.env.STAGE,
                            },
                            {
                                Name: "EXECUTION_TYPE",
                                Value: isHistorical ? "historical" : "real-time",
                            },
                        ],
                        Unit: "None",
                        Value: value,
                    },
                ],
                Namespace: this.namespace,
            })
            .promise();
    }
}
