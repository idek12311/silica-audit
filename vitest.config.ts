import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    pool: 'forks',
    fileParallelism: false,
    globals: true,
    testTimeout: 30000,
    hookTimeout: 30000,
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/main.ts', '**/*.test.ts', '**/*.d.ts'],
      thresholds: {
        lines: 80,
        branches: 70,
        functions: 85,
        statements: 80,
      },
      reporter: ['text', 'json', 'html'],
    },
  },
});
