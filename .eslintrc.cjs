/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  env: {
    node: true,
    es2022: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    project: './tsconfig.json',
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
  ],
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/explicit-function-return-type': ['warn', { allowExpressions: true }],
    'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
    'eqeqeq': ['error', 'always'],
    'no-var': 'error',
    'prefer-const': 'error',
  },
  ignorePatterns: ['dist/', 'node_modules/', '**/*.js', 'vitest.config.ts', '.eslintrc.cjs'],
};
