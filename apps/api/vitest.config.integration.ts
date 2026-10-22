import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.integration.spec.ts'],
    // Specs share one database.
    fileParallelism: false,
  },
});
