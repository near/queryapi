module.exports = {
  parser: '@typescript-eslint/parser',
  env: {
    es2021: true,
    node: true
  },
  overrides: [
    {
      files: ['.eslintrc.js', 'jest.config.js'],
      parser: 'espree',
      extends: ['standard'],
      rules: {
        semi: ['error', 'always'],
        quotes: ['error', 'single'],
        'array-callback-return': ['error', { allowImplicit: false }]
      }
    },
    {
      files: ['**/*.ts'],
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: __dirname
      },
      extends: [
        'standard-with-typescript'
      ],
      rules: {
        '@typescript-eslint/semi': ['error', 'always'],
        '@typescript-eslint/comma-dangle': ['error', 'only-multiline'],
        '@typescript-eslint/strict-boolean-expressions': 'off',
        'array-callback-return': ['error', { allowImplicit: false }]
      }
    }
  ]
};
