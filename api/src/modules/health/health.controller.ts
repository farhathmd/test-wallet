import { Controller, Get } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { ServiceUnavailableError } from '../../domain/errors';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Liveness/readiness probe.
 *
 * It is public (an orchestrator has no token) and it **touches the database on purpose**: a process
 * that is up but cannot reach Postgres must be taken out of rotation, and the only way to know that
 * is to ask the database. One cheap query, no connection held.
 */
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async check(): Promise<{ status: string; db: string }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      // The driver's message is deliberately not forwarded: it can contain the connection string.
      throw new ServiceUnavailableError('Database is unreachable.');
    }
    return { status: 'ok', db: 'up' };
  }
}
