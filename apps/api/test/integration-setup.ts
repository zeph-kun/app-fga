import { execFileSync } from 'node:child_process';
import pg from 'pg';
import { testDatabaseUrl } from './test-database.js';

/** Creates the test database if it is missing and brings it up to the current migrations. */
export default async function setup(): Promise<void> {
  const url = new URL(testDatabaseUrl());
  const name = url.pathname.slice(1);
  if (!/^[a-z0-9_]+_test$/.test(name)) {
    throw new Error(`Refusing to run integration specs on "${name}": a test database name must end in "_test".`);
  }

  const admin = new pg.Client({ connectionString: Object.assign(new URL(url), { pathname: '/postgres' }).href });
  await admin.connect();
  try {
    const { rowCount } = await admin.query('select 1 from pg_database where datname = $1', [name]);
    if (rowCount === 0) await admin.query(`create database "${name}"`);
  } finally {
    await admin.end();
  }

  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: url.href },
    stdio: 'inherit',
  });
}
