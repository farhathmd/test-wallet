import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

/**
 * The probe endpoint. No service and no repository: the controller asks the database directly because
 * "can we reach the database?" is the whole question, and one more layer would only obscure it.
 */
@Module({
  controllers: [HealthController],
})
export class HealthModule {}
