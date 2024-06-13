module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]sx?$': 'ts-jest',
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  testPathIgnorePatterns: [
    "/frontend/src/components/Editor/__tests__/Editor.test.js",
    "/frontend/src/utils/formatters.test.js"
  ],
};
