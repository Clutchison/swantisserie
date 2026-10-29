import { existsSync } from 'node:fs';
import { defineConfig, env } from 'prisma/config';

// Locally, secrets live in the repo-root .env; on Heroku they are config vars.
const rootEnv = new URL('../.env', import.meta.url);
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // Migrations need Neon's direct (non-pooled) connection.
  datasource: { url: env('DIRECT_URL') },
});
