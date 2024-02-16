import { validateContractIds } from '../../../utils/validators';

// Test cases for validateContractIds function

test('it should return true for valid contract IDs', () => {
  const validIds = 'contract1.near, contract2.near, contract3.near';
  expect(validateContractIds(validIds)).toBe(true);
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

