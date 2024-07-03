export const sanitizeString = (str: string): string => {
  return str.replace(/[^a-zA-Z0-9]/g, '_').replace(/^([0-9])/, '_$1');
};

export const sanitizeIndexerName = (name: string): string => {
  return name.replaceAll('-', '_').trim().toLowerCase();
};

export const sanitizeAccountId = (accountId: string): string => {
  return accountId.replaceAll('.', '_');
};
