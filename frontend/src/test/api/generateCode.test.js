import handler from '../../pages/api/generateCode';
import { createMocks } from 'node-mocks-http';

jest.mock('../../utils/formatters', () => ({
    defaultCode: '// Default JS Code',
    defaultSchema: '-- Default SQL Schema',
}));

describe('API Handler', () => {
    it('should return generated JS and SQL code for valid input', async () => {
        const { req, res } = createMocks({
            method: 'POST',
            body: {
                contractFilter: 'filter',
                selectedMethods: ['method1', 'method2'],
                selectedEvents: ['event1', 'event2'],
            },
        });

        await handler(req, res);

        expect(res._getStatusCode()).toBe(200);
    });

    it('should return 400 if required fields are missing', async () => {
        const { req, res } = createMocks({
            method: 'POST',
            body: {},
        });

        await handler(req, res);

        expect(res._getStatusCode()).toBe(400);
        expect(JSON.parse(res._getData())).toEqual({ error: 'Missing required fields' });
    });

    it('should return 400 if selectedMethods or selectedEvents are not arrays', async () => {
        const { req, res } = createMocks({
            method: 'POST',
            body: {
                contractFilter: 'filter',
                selectedMethods: 'not-an-array',
                selectedEvents: [],
            },
        });

        await handler(req, res);

        expect(res._getStatusCode()).toBe(400);
        expect(JSON.parse(res._getData())).toEqual({ error: 'selectedMethods and selectedEvents must be arrays' });

        const { req: req2, res: res2 } = createMocks({
            method: 'POST',
            body: {
                contractFilter: 'filter',
                selectedMethods: [],
                selectedEvents: 'not-an-array',
            },
        });

        await handler(req2, res2);

        expect(res2._getStatusCode()).toBe(400);
        expect(JSON.parse(res2._getData())).toEqual({ error: 'selectedMethods and selectedEvents must be arrays' });
    });
});
