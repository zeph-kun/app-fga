/**
 * The database the integration specs use, never the one the app runs on: those specs empty
 * their tables before each test. Override with TEST_DATABASE_URL; its name must end in `_test`.
 */
export function testDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  return (
    env.TEST_DATABASE_URL ??
    `postgresql://postgres:${env.POSTGRES_PASSWORD ?? 'postgres'}@localhost:5432/app_test`
  );
}
