import { defineConfig } from 'vitest/config';
import { testDatabaseUrl } from './test/test-database.js';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.integration.spec.ts'],
    globalSetup: ['./test/integration-setup.ts'],
    // The specs read DATABASE_URL through loadEnv(): point it at the test database, not the app's.
    env: { DATABASE_URL: testDatabaseUrl() },
    // Specs share one database.
    fileParallelism: false,
  },
});
