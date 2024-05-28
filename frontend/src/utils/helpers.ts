export const sanitizeString = (str: string) => str.replace(/[^a-zA-Z0-9]/g, '_').replace(/^([0-9])/, '_$1');
