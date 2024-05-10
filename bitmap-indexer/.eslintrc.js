module.exports = {
  parser: '@typescript-eslint/parser',
  env: {
    es2021: true,
    node: true,
  },
  overrides: [
    {
      files: ['.eslintrc.js', 'jest.config.js'],
      parser: 'espree',
      extends: ['standard'],
      rules: {
        semi: ['error', 'always'],
        'comma-dangle': ['error', 'only-multiline'],
      },
    },
    {
      files: ['./src/**/*', './tests/**/*'],
      parserOptions: {
        project: './tsconfig.json',
      },
      extends: [
        'standard-with-typescript',
      ],
      rules: {
        '@typescript-eslint/semi': ['error', 'always'],
        '@typescript-eslint/comma-dangle': ['error', 'only-multiline'],
        '@typescript-eslint/strict-boolean-expressions': 'off',
      },
    },
  ],
};
