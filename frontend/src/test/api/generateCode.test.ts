import type { NextApiRequest, NextApiResponse } from 'next';
import type { MockRequest, MockResponse } from 'node-mocks-http';
import { createMocks } from 'node-mocks-http';

import handler from '../../pages/api/generateCode';

type CustomNextApiRequest = NextApiRequest & MockRequest<any>;
type CustomNextApiResponse = NextApiResponse & MockResponse<any>;

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS';

const createRequestResponseMocks = (
  method: HttpMethod,
  body: any,
): { req: CustomNextApiRequest; res: CustomNextApiResponse } => {
  const { req, res } = createMocks({
    method,
    body,
  });
  return {
    req: req as CustomNextApiRequest,
    res: res as CustomNextApiResponse,
  };
};

describe('API Handler', () => {
  it('should return generated JS and SQL code for valid input', async () => {
    const { req, res } = createRequestResponseMocks('POST', {
      contractFilter: 'filter',
      selectedMethods: [
        {
          method_name: 'method1',
          schema: { type: 'object' },
        },
        {
          method_name: 'method2',
          schema: { type: 'string' },
        },
      ],
      selectedEvents: [
        {
          event_name: 'event1',
          schema: { type: 'array', items: { type: 'string' } },
        },
        {
          event_name: 'event2',
          schema: { type: 'number' },
        },
      ],
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const responseData = JSON.parse(res._getData());
    expect(responseData).toHaveProperty('jsCode');
    expect(responseData).toHaveProperty('sqlCode');
  });

  it('should return 400 if required fields are missing', async () => {
    const { req, res } = createRequestResponseMocks('POST', {});

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData())).toEqual({
      error: 'Invalid request body: selectedMethods and selectedEvents must be arrays of objects with correct shape',
    });
  });

  it('should return 400 if selectedMethods or selectedEvents are not arrays of objects with correct shape', async () => {
    const { req, res } = createRequestResponseMocks('POST', {
      contractFilter: 'filter',
      selectedMethods: 'not-an-array',
      selectedEvents: [],
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData())).toEqual({
      error: 'Invalid request body: selectedMethods and selectedEvents must be arrays of objects with correct shape',
    });

    const { req: req2, res: res2 } = createRequestResponseMocks('POST', {
      contractFilter: 'filter',
      selectedMethods: [],
      selectedEvents: 'not-an-array',
    });

    await handler(req2, res2);

    expect(res2._getStatusCode()).toBe(400);
    expect(JSON.parse(res2._getData())).toEqual({
      error: 'Invalid request body: selectedMethods and selectedEvents must be arrays of objects with correct shape',
    });
  });

  it('should return 400 for invalid schema format', async () => {
    const { req, res } = createRequestResponseMocks('POST', {
      contractFilter: 'filter',
      selectedMethods: [
        {
          method_name: 'method1',
          schema: { type: 'invalid-type' },
        },
      ],
      selectedEvents: [
        {
          event_name: 'event1',
          schema: { type: 'object', properties: { token_id: { type: 'invalid-type' } } },
        },
      ],
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData())).toEqual({
      error: 'Invalid request body: selectedMethods and selectedEvents must be arrays of objects with correct shape',
    });
  });

  it('should handle OPTIONS request correctly', async () => {
    const { req, res } = createRequestResponseMocks('OPTIONS', {});

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
  });

  it('should handle empty arrays correctly because I mean maybe they just want something to do with contractName?', async () => {
    const { req, res } = createRequestResponseMocks('POST', {
      contractFilter: 'filter',
      selectedMethods: [],
      selectedEvents: [],
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const responseData = JSON.parse(res._getData());
    expect(responseData).toHaveProperty('jsCode');
    expect(responseData).toHaveProperty('sqlCode');
  });

  it('should return 400 for invalid contractFilter data type', async () => {
    const { req, res } = createRequestResponseMocks('POST', {
      contractFilter: 123, 
      selectedMethods: [
        {
          method_name: 'method1',
          schema: { type: 'object' },
        },
      ],
      selectedEvents: [
        {
          event_name: 'event1',
          schema: { type: 'string' },
        },
      ],
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData())).toEqual({
      error: 'Invalid request body: selectedMethods and selectedEvents must be arrays of objects with correct shape',
    });
  });

  it('should return 400 for invalid method or event data types', async () => {
    const { req, res } = createRequestResponseMocks('POST', {
      contractFilter: 'filter',
      selectedMethods: [
        {
          method_name: 'method1',
          schema: 'invalid-schema',
        },
      ],
      selectedEvents: [
        {
          event_name: 'event1',
          schema: { type: 'string' },
        },
      ],
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData())).toEqual({
      error: 'Invalid request body: selectedMethods and selectedEvents must be arrays of objects with correct shape',
    });
  });

  it('should have correct CORS headers', async () => {
    const { req, res } = createRequestResponseMocks('POST', {
      contractFilter: 'filter',
      selectedMethods: [
        {
          method_name: 'method1',
          schema: { type: 'object' },
        },
      ],
      selectedEvents: [
        {
          event_name: 'event1',
          schema: { type: 'string' },
        },
      ],
    });

    await handler(req, res);

    expect(res.getHeaders()).toHaveProperty('access-control-allow-origin', '*');
    expect(res.getHeaders()).toHaveProperty('access-control-allow-methods', 'POST, OPTIONS');
    expect(res.getHeaders()).toHaveProperty('access-control-allow-headers', 'Content-Type');
  });
});
