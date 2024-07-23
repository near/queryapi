import type { NextApiRequest, NextApiResponse } from 'next';

import { defaultCode, defaultSchema } from '../../utils/formatters';

interface RequestBody {
  contractFilter: string | string[];
  selectedMethods: string[];
  selectedEvents: string[];
}

const validateRequestBody = (body: any): body is RequestBody => {
  const isStringOrArray = (value: any): value is string | string[] =>
    typeof value === 'string' || (Array.isArray(value) && value.every((item) => typeof item === 'string'));

  return (
    isStringOrArray(body.contractFilter) &&
    Array.isArray(body.selectedMethods) &&
    body.selectedMethods.every((method: any) => typeof method === 'string') &&
    Array.isArray(body.selectedEvents) &&
    body.selectedEvents.every((event: any) => typeof event === 'string')
  );
};

const generateDummyJSCode = (
  contractFilter: string | string[],
  selectedMethods: string[],
  selectedEvents: string[],
): string => {
  const filterString = Array.isArray(contractFilter) ? contractFilter.join(', ') : contractFilter;
  const jsCodeHeader =
    `// JavaScript Code\n\n` +
    `-- Contract Filter: ${filterString}\n\n` +
    `-- Selected Methods: ${selectedMethods.join(', ')}\n\n` +
    `-- Selected Events: ${selectedEvents.join(', ')}\n\n`;

  const methodsJS = selectedMethods
    .map((method) => `function ${method}() {\n  console.log('Executing ${method}');\n}\n\n`)
    .join('');

  const eventsJS = selectedEvents
    .map((event) => `function handle${event}() {\n  console.log('Handling event ${event}');\n}\n\n`)
    .join('');

  return jsCodeHeader + defaultCode + methodsJS + eventsJS;
};

const generateDummySQLCode = (
  contractFilter: string | string[],
  selectedMethods: string[],
  selectedEvents: string[],
): string => {
  const filterString = Array.isArray(contractFilter) ? contractFilter.join(', ') : contractFilter;
  const sqlCodeHeader =
    `-- SQL Code\n\n` +
    `-- Contract Filter: ${filterString}\n\n` +
    `-- Selected Methods: ${selectedMethods.join(', ')}\n\n` +
    `-- Selected Events: ${selectedEvents.join(', ')}\n\n`;

  const methodsSQL = selectedMethods
    .map((method) => `-- Method: ${method}\nINSERT INTO methods (name) VALUES ('${method}');\n\n`)
    .join('');

  const eventsSQL = selectedEvents
    .map((event) => `-- Event: ${event}\nINSERT INTO events (name) VALUES ('${event}');\n\n`)
    .join('');

  return sqlCodeHeader + defaultSchema + methodsSQL + eventsSQL;
};

export default function handler(req: NextApiRequest, res: NextApiResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST');
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
      error:
        'Invalid request body: contractFilter must be a string or an array of strings, and selectedMethods and selectedEvents must be arrays of strings',
    });
    return;
  }

  const { contractFilter, selectedMethods, selectedEvents } = req.body;

  const jsCode = generateDummyJSCode(contractFilter, selectedMethods, selectedEvents);
  const sqlCode = generateDummySQLCode(contractFilter, selectedMethods, selectedEvents);

  res.status(200).json({ jsCode, sqlCode });
}
