const CONTRACT_NAME_REGEX = /^(?:\*|(?:[a-z\d]+[-_])*[a-z\d]+)(?:\.(?:\*|(?:[a-z\d]+[-_])*[a-z\d]+))*\.near$/i;

function validateContractId(accountId) {
  const isWildcard = accountId.trim() === "*" || accountId.trim() === "*.near";
  const isLengthValid = accountId.length >= 2 && accountId.length <= 64;
  const isRegexValid = CONTRACT_NAME_REGEX.test(accountId);
  return isWildcard || (isRegexValid && isLengthValid);
}

function validateContractIds(accountIds) {
  const ids = accountIds.split(',').map(id => id.trim());
  return ids.every(accountId => validateContractId(accountId));
}

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

  test('it should return false for contract ID with leading or trailing spaces', () => {
    const spacedId = ' contract1.near ';
    expect(validateContractId(spacedId)).toBe(false);
  });

  test('it should return false for contract ID with consecutive dots', () => {
    const dotId = 'contract..near';
    expect(validateContractId(dotId)).toBe(false);
  });

  test('it should return false for contract ID with invalid characters', () => {
    const invalidCharsId = 'contract@near';
    expect(validateContractId(invalidCharsId)).toBe(false);
  });
});

describe('validateContractIds', () => {
  test('it should return true for valid contract IDs', () => {
    const validIds = 'contract1.near, contract2.near, contract3.near';
    expect(validateContractIds(validIds)).toBe(true);
  });

  test('it should return true for wildcard contract ID in a list', () => {
    const mixedIds = 'contract1.near, *.near, contract3.near';
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

  test('it should return false for an invalid wildcard contract ID', () => {
    const invalidWildcard = '*invalid.near';
    expect(validateContractIds(invalidWildcard)).toBe(false);
  });
});