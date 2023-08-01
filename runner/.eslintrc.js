module.exports = {
  parser: '@typescript-eslint/parser',
  env: {
    es2021: true,
    node: true
  },
  extends: [
    'standard-with-typescript'
  ],
  overrides: [
    {
      files: ['*.js', '*.jsx', '*.ts', '*.tsx'],
      parserOptions: {
        project: './tsconfig.json'
      }
    }
  ],
  rules: {
    '@typescript-eslint/semi': ['error', 'always'],
    '@typescript-eslint/comma-dangle': ['error', 'only-multiline'],
    '@typescript-eslint/strict-boolean-expressions': 'off'
  }
};
