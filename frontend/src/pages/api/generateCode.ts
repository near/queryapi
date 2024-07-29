import type { NextApiRequest, NextApiResponse } from 'next';

import { defaultCode, defaultSchema } from '../../utils/formatters';
import { createSchema } from 'genson-js';
import type { Schema } from 'genson-js/dist/types';

export type Method = {
  method_name: string;
  schema: Schema;
};

export type Event = {
  event_name: string;
  schema: Schema;
};

export interface RequestBody {
  contractFilter: string | string[];
  selectedMethods: Method[];
  selectedEvents?: Event[];
}

export const isStringOrArray = (value: any): value is string | string[] =>
  (typeof value === 'string' && value !== '') ||
  (Array.isArray(value) && value.every((item) => typeof item === 'string'));

export const isValidSchema = (schema: any): boolean => {
  try {
    createSchema(schema);
    return true;
  } catch {
    return false;
  }
};

export const validateRequestBody = (body: any): body is RequestBody => {
  return (
    isStringOrArray(body.contractFilter) &&
    Array.isArray(body.selectedMethods) &&
    body.selectedMethods.every(isValidMethod)
    // &&
    // Array.isArray(body.selectedEvents) &&
    // body.selectedEvents.every(isValidEvent)
  );
};

export const isValidMethod = (item: any): item is Method =>
  typeof item === 'object' &&
  typeof item.method_name === 'string' &&
  item.method_name.trim() !== '' &&
  isValidSchema(item.schema);

export const isValidEvent = (item: any): item is Event =>
  typeof item === 'object' &&
  typeof item.event_name === 'string' &&
  item.event_name.trim() !== '' &&
  isValidSchema(item.schema);

const generateDummyJSCode = (
  contractFilter: string | string[],
  selectedMethods: Method[],
  selectedEvents?: Event[],
): string => {
  // All Types Of Methods
  // const allMethodTypeList = selectedMethods.map(method => {
  //   return createSchema(method.schema);
  // });

  const filterString = Array.isArray(contractFilter) ? contractFilter.join(', ') : contractFilter;
  const jsCodeHeader =
    `// JavaScript Code\n\n` +
    `-- Contract Filter: ${filterString}\n\n` +
    `-- Selected Methods: ${selectedMethods.map((m) => m.method_name).join(', ')}\n\n`;
  // `-- Selected Events: ${selectedEvents.map((e) => e.event_name).join(', ')}\n\n`;

  const methodsJS = selectedMethods
    .map((method) => `function ${method.method_name}() {\n  console.log('Executing ${method.method_name}');\n}\n\n`)
    .join('');

  // const eventsJS = selectedEvents
  //   .map(
  //     (event) => `function handle${event.event_name}() {\n  console.log('Handling event ${event.event_name}');\n}\n\n`,
  //   )
  //   .join('');

  return jsCodeHeader + defaultCode + methodsJS;
};

const generateDummySQLCode = (
  contractFilter: string | string[],
  selectedMethods: Method[],
  selectedEvents?: Event[],
): string => {
  // All Types Of Methods
  // const allMethodTypeList = selectedMethods.map(method => {
  //   return createSchema(method.schema);
  // });

  const filterString = Array.isArray(contractFilter) ? contractFilter.join(', ') : contractFilter;
  const sqlCodeHeader =
    `-- SQL Code\n\n` +
    `-- Contract Filter: ${filterString}\n\n` +
    `-- Selected Methods: ${selectedMethods.map((m) => m.method_name).join(', ')}\n\n`;
  // `-- Selected Events: ${selectedEvents.map((e) => e.event_name).join(', ')}\n\n`;

  const methodsSQL = selectedMethods
    .map(
      (method) => `-- Method: ${method.method_name}\nINSERT INTO methods (name) VALUES ('${method.method_name}');\n\n`,
    )
    .join('');

  // const eventsSQL = selectedEvents
  //   .map((event) => `-- Event: ${event.event_name}\nINSERT INTO events (name) VALUES ('${event.event_name}');\n\n`)
  //   .join('');

  return sqlCodeHeader + defaultSchema + methodsSQL;
};

export default function handler(req: NextApiRequest, res: NextApiResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  if (!validateRequestBody(req.body)) {
    res.status(400).json({
      error: 'Invalid request body: selectedMethods and selectedEvents must be arrays of objects with correct shape',
    });
    return;
  }

  const { contractFilter, selectedMethods, selectedEvents } = req.body;

  const jsCode = generateDummyJSCode(contractFilter, selectedMethods, selectedEvents);
  const sqlCode = generateDummySQLCode(contractFilter, selectedMethods, selectedEvents);

  res.status(200).json({ jsCode, sqlCode });
}
