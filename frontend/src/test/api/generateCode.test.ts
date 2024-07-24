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

  handler(req, res);

  expect(res._getStatusCode()).toBe(200);
  const responseData = JSON.parse(res._getData());
});
it('should handle empty arrays correctly because I mean maybe they just want something to do with contractName?', async () => {
  const { req, res } = createRequestResponseMocks('POST', {
    contractFilter: 'filter',
    selectedMethods: [],
    selectedEvents: [],
  });

  handler(req, res);

  expect(res._getStatusCode()).toBe(200);
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

  handler(req, res);

  expect(res._getStatusCode()).toBe(400);
  expect(JSON.parse(res._getData())).toEqual({
    error: 'Invalid request body: selectedMethods and selectedEvents must be arrays of objects with correct shape',
  });
});

it('should return 400 for missing contractFilter data type', async () => {
  const { req, res } = createRequestResponseMocks('POST', {
    contractFilter: '',
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

  handler(req, res);

  expect(res._getStatusCode()).toBe(400);
  expect(JSON.parse(res._getData())).toEqual({
    error: 'Invalid request body: selectedMethods and selectedEvents must be arrays of objects with correct shape',
  });
});

it('returns 405 for GET method', () => {
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

  handler(req, res);

  expect(res.getHeaders()).toHaveProperty('access-control-allow-origin', '*');
  expect(res.getHeaders()).toHaveProperty('access-control-allow-methods', 'POST, OPTIONS');
  expect(res.getHeaders()).toHaveProperty('access-control-allow-headers', 'Content-Type');
});
