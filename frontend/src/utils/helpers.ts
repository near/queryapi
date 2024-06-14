export const sanitizeString = (str: string): string => {
  return str.replace(/[^a-zA-Z0-9]/g, '_').replace(/^([0-9])/, '_$1');
};
