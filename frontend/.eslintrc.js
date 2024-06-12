module.exports = {
  parser: '@typescript-eslint/parser',
  env: {
    es2021: true,
    node: true,
    jest: true
  },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'plugin:@next/next/recommended',
    'next/core-web-vitals',
    'plugin:@typescript-eslint/recommended',
  ],
  overrides: [
    {
      files: ['./src/**/*.js', './src/**/*.jsx'],
      parser: 'espree',
      rules: {
        semi: ['error', 'always'],
        'comma-dangle': ['error', 'only-multiline'],
        'eol-last': ['error', 'always'],
        '@typescript-eslint/no-empty-function': ['warn', { allow: ['methods'] }],
      },
    },
    {
      files: ['./src/**/*', './tests/**/*', './**/*.json'],
      excludedFiles: ['./src/**/*.js', './src/**/*.jsx'],
      parserOptions: {
        project: './tsconfig.json',
      },
      extends: ['standard-with-typescript'],
      rules: {
        '@typescript-eslint/semi': ['error', 'always'],
        '@typescript-eslint/comma-dangle': ['error', 'only-multiline'],
        '@typescript-eslint/strict-boolean-expressions': 'off',
        'eol-last': ['error', 'always'],
        '@typescript-eslint/no-unused-vars': 'warn',
        '@typescript-eslint/no-empty-function': ['warn', { allow: ['methods'] }],
      },
    },
  ],
};
