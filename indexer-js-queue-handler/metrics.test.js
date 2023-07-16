import { jest } from '@jest/globals';

import Metrics from './metrics';

describe('Metrics', () => {
    const oldEnv = process.env;

    beforeAll(() => {
        process.env = {
            ...oldEnv,
            STAGE: 'dev',
        };
    });

    afterAll(() => {
        process.env = oldEnv;
    });

    it('writes the block height for an indexer function', async () => {
        const cloudwatch = {
            putMetricData: jest.fn().mockReturnValueOnce({ promise: jest.fn() })
        };
        const metrics = new Metrics('test', cloudwatch);

        await metrics.putBlockHeight('morgs.near', 'test', false, 2);

        expect(cloudwatch.putMetricData).toBeCalledTimes(1);
        expect(cloudwatch.putMetricData.mock.calls[0]).toMatchSnapshot()
    });
})
