import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/configuration';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

/**
 * The Prisma client, wired to the application's configuration and to the NestJS lifecycle.
 *
 * Prisma 7 requires a driver adapter for direct database access; `@prisma/adapter-pg` owns a `pg`
 * pool whose size comes from `DB_POOL_MAX`. The pool is created lazily on first query, and
 * `connect()` here surfaces a bad DATABASE_URL at boot instead of at the first request.
 *
 * Extending `PrismaClient` (rather than wrapping it) is deliberate: services get the full typed API
 * (`prisma.user.findUnique(...)`) plus `$transaction`, without a pass-through method for each call.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    super({
      adapter: new PrismaPg({
        connectionString: config.databaseUrl,
        max: config.dbPoolMax,
      }),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('connected to PostgreSQL');
  }

  async onModuleDestroy(): Promise<void> {
    // Closes the pg pool as well, so `enableShutdownHooks()` in main.ts drains cleanly.
    await this.$disconnect();
  }
}
