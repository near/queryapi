import { createSchema } from 'genson-js';
import type { Schema } from 'genson-js/dist/types';
import type { NextApiRequest, NextApiResponse } from 'next';

export type Method = {
  method_name: string;
  schema: Schema;
};
import { WizardCodeGenerator } from './WizardCodeGenerator';

export type Event = {
  event_name: string;
  schema: Schema;
};

export interface RequestBody {
  contractFilter: string | string[];
  selectedMethods: Method[];
  selectedEvents: Event[];
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
    body.selectedMethods.every(isValidMethod) //&&
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
  const filterString = Array.isArray(contractFilter) ? contractFilter.join(', ') : contractFilter;

  const generator = new WizardCodeGenerator(filterString, selectedMethods, selectedEvents);
  const { jsCode, sqlCode } = generator.generateCode();

  res.status(200).json({ jsCode, sqlCode });
}
