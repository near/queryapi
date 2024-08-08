module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/*.test.ts'],
  testTimeout: 10000,
  moduleNameMapper: {
    '^runner/(.*)$': '<rootDir>/../runner/$1', // Ensure tests can find runner imports
    '^src/(.*)$': '<rootDir>/../runner/src/$1' // Ensure tests can find runner absolute imports
  }
};
