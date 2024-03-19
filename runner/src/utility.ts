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
