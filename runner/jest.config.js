module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['./src', './tests'],
  logPattern: '{{timestamp}} {{file}}:\n{{log}}'
};
