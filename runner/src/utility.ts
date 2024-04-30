import { type Tracer } from '@opentelemetry/api';
import VError from 'verror';

export async function wrapError<T> (fn: () => Promise<T>, errorMessage: string): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof Error) {
      throw new VError(error, errorMessage);
    }
    throw new VError(errorMessage);
  }
}

export async function wrapSpan<T> (fn: () => Promise<T>, tracer: Tracer, spanName: string): Promise<T> {
  const span = tracer.startSpan(spanName);
  try {
    return await fn();
  } finally {
    span.end();
  }
}
