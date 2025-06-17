import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/tests/**/*.test.ts'],
    exclude: ['node_modules'],
    globals: true,
    testTimeout: 10000, // Increase timeout for HTTP tests
  },
}); 