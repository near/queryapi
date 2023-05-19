import {consumer} from './handler';
import {jest} from '@jest/globals';

describe('consumer', () => {
    jest.setTimeout(30000);

    const body = {
        "chain_id": "Mainnet",
        "indexer_rule_id": 1,
        "indexer_rule_name": "Function set called in social.near",
        "payload": {
            "Actions": {
                "block_hash": "BmuLkzmAT36wANBvdsDckFGUioJSZHdiYQRyh2WKRun9",
                "receipt_id": "9CGkmYSMq6Bc1qVFjhQ8Au9gdYdsdr1zXZkNcPRgHvCj",
                "transaction_hash": "6tyaAAkyJugueAssZn52S242MUTwtt89bPiokC8H5wDQ"
            }
        },
        "block_height": 86956588,
        "function_name": "buildnear.testnest/test_demo_height",
        "function_code": "{\"code\":\" const h = block.header().height; console.log('About to write demo_blockheight', h); context.set('test_demo_height', h) \",\"schema\":\"\\nCREATE TABLE key_value (\\n  key text NOT NULL,\\n  value text NOT NULL\\n);\\n\",\"start_block_height\":null}"
    };
    const testEvent2 = {
        "Records": [
            {
                "messageId": "059f36b4-87a3-44ab-83d2-661975830a7d",
                "receiptHandle": "AQEBwJnKyrHigUMZj6rYigCgxlaS3SLy0a...",
                "body": JSON.stringify(body),
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
        expect(result).toEqual({"body": { "# of mutations applied": 1}, "statusCode": 200});
    });
});
