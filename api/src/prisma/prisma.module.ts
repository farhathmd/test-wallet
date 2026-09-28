import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * Provides the single PrismaClient instance for the whole application.
 *
 * Global because it is infrastructure rather than a feature: every module that owns data access
 * injects the same client (and therefore the same connection pool) instead of opening its own.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
