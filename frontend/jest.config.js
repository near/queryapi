module.exports = {
  "type": "module",
  "testEnvironment": "node",
  "transform": {
    "^.+\\.jsx?$": "babel-jest"
  },
  testPathIgnorePatterns: [
    '/formatters\\.test\\.js',
    '/Editor\\.test\\.js',
    // Add more patterns if needed
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};