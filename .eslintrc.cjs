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
  overrides: [
    {
      // Validation tier handler shells implement an async port (`attempt(): Promise<...>`)
      // and intentionally throw `NotYetBound` until the per-VM implementor is wired.
      // The shell signature is async because real implementors await tool/RPC calls;
      // the shell itself has nothing to await.
      files: ['src/validation/handlers/*.ts'],
      rules: {
        '@typescript-eslint/require-await': 'off',
      },
    },
    {
      // In-memory store stubs implement the same async port as their
      // Postgres-backed counterparts. The in-memory shell has nothing to await.
      files: ['src/heuristic/store.ts', 'src/scope/store.ts', 'scripts/seed-heuristics.ts'],
      rules: {
        '@typescript-eslint/require-await': 'off',
      },
    },
  ],
};
