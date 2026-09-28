// Prisma CLI configuration (Prisma 7 moved datasource/CLI settings out of schema.prisma).
//
// The CLI runs as a standalone process, so it loads `.env` itself: `dotenv/config` fills
// `process.env.DATABASE_URL` before Prisma resolves the datasource below. The running API never
// uses this file — it gets its configuration from @nestjs/config (see src/config/configuration.ts).
import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
