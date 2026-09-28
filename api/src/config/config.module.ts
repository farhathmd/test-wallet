import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { AppConfig, isTestEnvironment, loadConfig } from './configuration';

/** Injection token for the validated, frozen application configuration. */
export const APP_CONFIG = 'APP_CONFIG';

/**
 * Configuration module.
 *
 * Two responsibilities, both about configuration only:
 *   * `NestConfigModule.forRoot()` loads `.env` into `process.env` (skipped under Jest, where the
 *     test harness sets its own variables so a developer's `.env` can never leak into a test run),
 *   * `APP_CONFIG` provides the validated snapshot every other module injects.
 *
 * Global on purpose: configuration is a cross-cutting concern and must not be re-imported everywhere.
 */
@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: isTestEnvironment(),
      cache: true,
    }),
  ],
  providers: [
    {
      provide: APP_CONFIG,
      useFactory: (): AppConfig => loadConfig(),
    },
  ],
  exports: [APP_CONFIG],
})
export class AppConfigModule {}
