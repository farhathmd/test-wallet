import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/config.module';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { ReportingModule } from './modules/reporting/reporting.module';
import { WalletModule } from './modules/wallet/wallet.module';
import { PersistenceModule } from './repositories/persistence.module';

/**
 * Composition root.
 *
 * The only place that knows how the features fit together: configuration and persistence are global
 * infrastructure, and each feature module is imported once. A feature therefore never imports another
 * feature — the shared pieces they need (repositories, config, token handling) all arrive through
 * these global modules.
 */
@Module({
  imports: [AppConfigModule, PersistenceModule, AuthModule, WalletModule, ReportingModule, HealthModule],
})
export class AppModule {}
