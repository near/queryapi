import {consumer} from './handler';
import {jest} from '@jest/globals';

describe('consumer', () => {
    jest.setTimeout(30000);

    const testEvent2 = {
        "Records": [
            {
                "messageId": "059f36b4-87a3-44ab-83d2-661975830a7d",
                "receiptHandle": "AQEBwJnKyrHigUMZj6rYigCgxlaS3SLy0a...",
                "body": "{\"triggered_alert_id\":9,\"destination_config\":{\"Aggregation\":{\"destination_id\":1,\"indexer_name\":\"posts_likes\",\"indexer_function_code\":\"for(let p in block.getPosts)) {\\n  context.save(a);\\n]\"}},\"alert_message\":{\"chain_id\":\"Mainnet\",\"alert_rule_id\":2,\"alert_name\":\"Function set called in social.near\",\"payload\":{\"Actions\":{\"block_hash\":\"BF78K1ywApepy9MhdmJAoUzGJXK39fPKvuVeMGexBnBo\",\"receipt_id\":\"7CQFJNB7xiJ3698tHRB7qf8vjtYAevpuH56AYyb7iZJS\",\"transaction_hash\":\"B33KtoiKchh7P4Vu96DU1SsM59UuiMLjqh3C4zRHdjYG\"}},\"block_height\":84331720}}",
                "attributes": {
                    "ApproximateReceiveCount": "1",
                    "SentTimestamp": "1545082649183",
                    "SenderId": "AIDAIENQZJOLO23YVJ4VO",
                    "ApproximateFirstReceiveTimestamp": "1545082649185"
                },
                "messageAttributes": {},
                "md5OfBody": "098f6bcd4621d373cade4e832627b4f6",
                "eventSource": "aws:sqs",
                "eventSourceARN": "arn:aws:sqs:us-east-2:123456789012:my-queue",
                "awsRegion": "us-east-2"
            }
        ]
    }

    test('consumer parses SQS message', async () => {
        const result = await consumer(testEvent2);
        expect(result).toEqual({"body": { "# of mutations applied": 2}, "statusCode": 200});
    });
});
