module.exports = {
    preset: './babel.config.js',  // Point to your Babel configuration file
    testPathIgnorePatterns: [
      '/formatters\\.test\\.js',
      '/Editor\\.test\\.js',
      // Add more patterns if needed
    ],
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
      },
  };