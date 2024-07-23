import { createMocks } from 'node-mocks-http';

import handler from '../../pages/api/generateCode';

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
    const responseData = JSON.parse(res._getData());
    expect(responseData).toHaveProperty('jsCode');
    expect(responseData).toHaveProperty('sqlCode');
  });

  it('should return 400 if required fields are missing', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      body: {},
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData())).toEqual({
      error:
        'Invalid request body: contractFilter must be a string or an array of strings, and selectedMethods and selectedEvents must be arrays of strings',
    });
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
    expect(JSON.parse(res._getData())).toEqual({
      error:
        'Invalid request body: contractFilter must be a string or an array of strings, and selectedMethods and selectedEvents must be arrays of strings',
    });

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
    expect(JSON.parse(res2._getData())).toEqual({
      error:
        'Invalid request body: contractFilter must be a string or an array of strings, and selectedMethods and selectedEvents must be arrays of strings',
    });
  });

  it('should handle OPTIONS request correctly', async () => {
    const { req, res } = createMocks({
      method: 'OPTIONS',
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
  });

  it('should handle empty arrays correctly', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      body: {
        contractFilter: 'filter',
        selectedMethods: [],
        selectedEvents: [],
      },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const responseData = JSON.parse(res._getData());
    expect(responseData).toHaveProperty('jsCode');
    expect(responseData).toHaveProperty('sqlCode');
    expect(responseData.jsCode).toContain('// JavaScript Code');
    expect(responseData.sqlCode).toContain('-- SQL Code');
  });

  it('should return 400 for invalid contractFilter data type', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      body: {
        contractFilter: 123,
        selectedMethods: ['method1'],
        selectedEvents: ['event1'],
      },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData())).toEqual({
      error:
        'Invalid request body: contractFilter must be a string or an array of strings, and selectedMethods and selectedEvents must be arrays of strings',
    });
  });

  it('should return 400 for invalid method or event data types', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      body: {
        contractFilter: 'filter',
        selectedMethods: [123],
        selectedEvents: ['event1'],
      },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData())).toEqual({
      error:
        'Invalid request body: contractFilter must be a string or an array of strings, and selectedMethods and selectedEvents must be arrays of strings',
    });
  });

  it('should handle large inputs correctly', async () => {
    const largeArray = Array.from({ length: 1000 }, (_, i) => `method${i}`);
    const { req, res } = createMocks({
      method: 'POST',
      body: {
        contractFilter: 'filter',
        selectedMethods: largeArray,
        selectedEvents: largeArray,
      },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const responseData = JSON.parse(res._getData());
    expect(responseData).toHaveProperty('jsCode');
    expect(responseData).toHaveProperty('sqlCode');
  });

  it('should return 405 for unsupported HTTP methods', async () => {
    const { req, res } = createMocks({
      method: 'GET',
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(405);
    expect(JSON.parse(res._getData())).toEqual({ error: 'Method Not Allowed' });
  });

  it('should have correct CORS headers', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      body: {
        contractFilter: 'filter',
        selectedMethods: ['method1'],
        selectedEvents: ['event1'],
      },
    });

    await handler(req, res);

    expect(res._getHeaders()).toHaveProperty('access-control-allow-origin', '*');
    expect(res._getHeaders()).toHaveProperty('access-control-allow-methods', 'POST');
    expect(res._getHeaders()).toHaveProperty('access-control-allow-headers', 'Content-Type');
  });
});
