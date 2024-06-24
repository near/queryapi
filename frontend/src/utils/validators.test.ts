import { defaultSchema } from './formatters';
import { validateContractId, validateContractIds, validateSQLSchema } from './validators';

describe('validateContractId', () => {
  test('it should return true for valid contract ID', () => {
    const validId = 'contract1.near';
    expect(validateContractId(validId)).toBe(true);
  });

  test('it should return true for wildcard contract ID', () => {
    const wildcardId = '*.near';
    expect(validateContractId(wildcardId)).toBe(true);
  });

  test('it should return false for empty string', () => {
    const emptyString = '';
    expect(validateContractId(emptyString)).toBe(false);
  });

  test('it should return false for invalid contract ID', () => {
    const invalidId = 'invalid$contract';
    expect(validateContractId(invalidId)).toBe(false);
  });

  test('it should return false for too short contract ID', () => {
    const shortId = 'c';
    expect(validateContractId(shortId)).toBe(false);
  });

  test('it should return false for too long contract ID', () => {
    const longId = 'a'.repeat(65);
    expect(validateContractId(longId)).toBe(false);
  });

  test('it should return true for contract ID with leading or trailing spaces', () => {
    const spacedId = '*.kaching ';
    expect(validateContractId(spacedId)).toBe(true);
  });

  test('it should return false for contract ID with consecutive dots', () => {
    const dotId = 'contract..near';
    expect(validateContractId(dotId)).toBe(false);
  });

  test('it should return false for contract ID with star in the middle characters', () => {
    const invalidAsteriskOrder = 'contract.*.near';
    expect(validateContractId(invalidAsteriskOrder)).toBe(false);
  });

  test('it should return false for contract ID with asterisk in center of string characters', () => {
    const invalidAsteriskPosition = 'contract*2.near';
    expect(validateContractId(invalidAsteriskPosition)).toBe(false);
  });

  test('it should return false for double asterisk in string', () => {
    const multipleAsteriskOrder = '**.near';
    expect(validateContractId(multipleAsteriskOrder)).toBe(false);
  });

  test('it should return false for double . in string', () => {
    const invalidDotPosition = '*..near';
    expect(validateContractId(invalidDotPosition)).toBe(false);
  });

  test('it should return false for contract ID starting with a dot', () => {
    const dotStartId = '.near';
    expect(validateContractId(dotStartId)).toBe(false);
  });

  test('it should return false for contract ID ending with a dot', () => {
    const dotEndId = 'contract.near.';
    expect(validateContractId(dotEndId)).toBe(false);
  });

  test('it should return false for contract ID ending with underscore or hyphen', () => {
    const underscoreEndId = 'contract.near_';
    const hyphenEndId = 'contract.near-';
    expect(validateContractId(underscoreEndId)).toBe(false);
    expect(validateContractId(hyphenEndId)).toBe(false);
  });

  // test on nomicon - https://nomicon.io/DataStructures/Account
  test('it should return false for string with whitespace characters', () => {
    const invalidWhitespace = 'not ok';
    expect(validateContractId(invalidWhitespace)).toBe(false);
  });

  test('it should return false for string that is too short', () => {
    const tooShort = 'a';
    expect(validateContractId(tooShort)).toBe(false);
  });

  test('it should return false for string with suffix separator', () => {
    const suffixSeparator = '100-';
    expect(validateContractId(suffixSeparator)).toBe(false);
  });

  test('it should return false for string with consecutive separators', () => {
    const consecutiveSeparators = 'bo__wen';
    expect(validateContractId(consecutiveSeparators)).toBe(false);
  });

  test('it should return false for string with prefix separator', () => {
    const prefixSeparator = '_illia';
    expect(validateContractId(prefixSeparator)).toBe(false);
  });

  test('it should return false for string with prefix dot separator', () => {
    const prefixDotSeparator = '.near';
    expect(validateContractId(prefixDotSeparator)).toBe(false);
  });

  test('it should return false for string with suffix dot separator', () => {
    const suffixDotSeparator = 'near.';
    expect(validateContractId(suffixDotSeparator)).toBe(false);
  });

  test('it should return false for string with two dot separators in a row', () => {
    const twoDotSeparators = 'a..near';
    expect(validateContractId(twoDotSeparators)).toBe(false);
  });

  test('it should return false for string with non-alphanumeric characters', () => {
    const nonAlphanumeric = '$$$';
    expect(validateContractId(nonAlphanumeric)).toBe(false);
  });

  test('it should return false for string with non-lowercase characters', () => {
    const nonLowercase = 'WAT';
    expect(validateContractId(nonLowercase)).toBe(false);
  });

  test('it should return false for string with @ character', () => {
    const invalidAtCharacter = 'me@google.com';
    expect(validateContractId(invalidAtCharacter)).toBe(false);
  });

  // not sure if this is valid
  // test('it should return false for system account', () => {
  //   const systemAccount = 'system';
  //   expect(validateContractId(systemAccount)).toBe(false);
  // });

  test('it should return false for string that is too long', () => {
    const tooLong = 'abcdefghijklmnopqrstuvwxyz.abcdefghijklmnopqrstuvwxyz.abcdefghijklmnopqrstuvwxyz';
    expect(validateContractId(tooLong)).toBe(false);
  });

  test('it should fail abc*.near', () => {
    const validId = 'abc*.near';
    expect(validateContractId(validId)).toBe(false);
  });

  test('it should succeed for *.a.b.c.near', () => {
    const validId = '*.a.b.c.near';
    expect(validateContractId(validId)).toBe(true);
  });

  test('it should succeed for *', () => {
    const validId = '*';
    expect(validateContractId(validId)).toBe(true);
  });
});

describe('validateContractIds', () => {
  test('it should return true for valid contract IDs', () => {
    const validIds = 'contract1.near, contract2.near, contract3.near';
    expect(validateContractIds(validIds)).toBe(true);
  });

  test('it should return true for wildcard contract ID in a list', () => {
    const mixedIds = 'contract1.near, *.kaching, contract3.near';
    expect(validateContractIds(mixedIds)).toBe(true);
  });

  test('it should return false for an empty string', () => {
    const emptyString = '';
    expect(validateContractIds(emptyString)).toBe(false);
  });

  test('it should return false for invalid contract IDs', () => {
    const invalidIds = 'invalid$contract, 123, contract with space';
    expect(validateContractIds(invalidIds)).toBe(false);
  });

  test('it should return false for a single invalid contract ID in the list', () => {
    const mixedIds = 'contract1, invalid$contract, contract3';
    expect(validateContractIds(mixedIds)).toBe(false);
  });

  test('it should return false for a mix of valid and invalid contract IDs', () => {
    const mixedIds = 'contract1.near, invalid$contract, contract3.near';
    expect(validateContractIds(mixedIds)).toBe(false);
  });

  test('it should return false for a mix of valid and invalid contract IDs with spaces', () => {
    const spacedIds = 'contract1.near, invalid$contract, contract3.near ';
    expect(validateContractIds(spacedIds)).toBe(false);
  });

  test('it should return true for a mix of valid and wildcard contract IDs', () => {
    const mixedIds = 'contract1.near, *.near, contract3.near';
    expect(validateContractIds(mixedIds)).toBe(true);
  });

  test('it should return false for an invalid wildcard contract ID where the wildcard is in the string', () => {
    const invalidWildcard = '*invalid.near';
    expect(validateContractIds(invalidWildcard)).toBe(false);
  });

  test('it should return false for an invalid wildcard contract ID followed by valid contractIDs', () => {
    const invalidWildcardWithOthers = '*invalid.near, contract1.near, *.near';
    expect(validateContractIds(invalidWildcardWithOthers)).toBe(false);
  });

  test('it should return false for an valid wildcard contract ID followed by invalid contractIDs', () => {
    const validWildCardwithInvalid = '*.invalid.near, *contract1.near, *.near';
    expect(validateContractIds(validWildCardwithInvalid)).toBe(false);
  });
});

const formattedDefaultSchema = `CREATE TABLE
  \"indexer_storage\" (
    \"function_name\" TEXT NOT NULL,
    \"key_name\" TEXT NOT NULL,
    \"value\" TEXT NOT NULL,
    PRIMARY KEY (\"function_name\", \"key_name\")
  )\n`;

jest.mock('./validators.ts', () => {
  const originalModule = jest.requireActual('./validators.ts');
  return {
    formatSchema: jest.fn(),
    generateTypes: jest.fn(),
    ...originalModule,
  };
});

describe('validateSQLSchema', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return null data and error for empty schema', () => {
    const result = validateSQLSchema('');
    expect(result).toEqual({ data: null, error: null });
  });

  it('should return formatted data and null error for default schema', () => {
    const result = validateSQLSchema(defaultSchema);
    expect(result).toEqual({ data: formattedDefaultSchema, error: null });
  });
});
