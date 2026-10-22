import { defineConfig } from 'prisma/config';
import { loadEnv } from './src/config/env.js';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: loadEnv().DATABASE_URL },
});
