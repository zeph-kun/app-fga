import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z.string().url().default('http://localhost:3000'),
  KEYCLOAK_ISSUER: z.string().url().default('http://localhost:8080/realms/app-fga'),
  /** Service-account client used to check a username exists before a Share. */
  KEYCLOAK_ADMIN_CLIENT_ID: z.string().min(1).default('api-service'),
  KEYCLOAK_ADMIN_CLIENT_SECRET: z.string().min(1).default('dev-api-service-secret'),
  DATABASE_URL: z.string().url().default('postgresql://postgres:postgres@localhost:5432/app'),
  OPENFGA_API_URL: z.string().url().default('http://localhost:8081'),
  OPENFGA_API_TOKEN: z.string().min(1).default('dev-openfga-key'),
  OPENFGA_STORE_NAME: z.string().min(1).default('app-fga'),
  OPENFGA_MODEL_PATH: z.string().min(1).default('../../infra/openfga/model.fga'),
  /** Usernames of the Managers, comma-separated: the only Users who may create Teams. */
  MANAGERS: z
    .string()
    .default('florian,adham,jeremy')
    .transform((list) => [...new Set(list.split(',').map((name) => name.trim()).filter(Boolean))]),
  /** Requests allowed per IP per minute, across the whole API. */
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(120),
});

export type Env = z.infer<typeof envSchema>;

export const ENV = Symbol('ENV');

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return envSchema.parse(source);
}
