import { Logger } from '@nestjs/common';
import { startServer } from './bootstrap';

/**
 * Process entry point.
 *
 * A configuration problem (missing `JWT_SECRET`, unreachable database) fails here, loudly and once,
 * instead of producing a server that answers some requests. Anything that escapes is reported and the
 * process exits non-zero, so a supervisor restarts it rather than keeping a broken instance alive.
 */
async function main(): Promise<void> {
  try {
    await startServer();
  } catch (error) {
    Logger.error(
      error instanceof Error ? error.message : String(error),
      error instanceof Error ? error.stack : undefined,
      'Bootstrap',
    );
    process.exitCode = 1;
  }
}

void main();
