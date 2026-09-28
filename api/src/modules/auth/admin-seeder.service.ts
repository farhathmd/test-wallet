import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_CONFIG } from '../../config/config.module';
import type { AppConfig } from '../../config/configuration';
import { normalizeUsername } from '../../domain/username';
import { UserRepository } from '../../repositories/user.repository';
import { PasswordService } from './password.service';

/**
 * Keeps the dashboard's admin account in step with configuration.
 *
 * It is an upsert, so running it on every boot is safe and idempotent, and rotating the admin password
 * is a configuration change plus a restart rather than a SQL statement. The account's balance and
 * ledger are never touched — only its credentials and role.
 */
@Injectable()
export class AdminSeeder {
  private readonly logger = new Logger(AdminSeeder.name);

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly users: UserRepository,
    private readonly passwords: PasswordService,
  ) {}

  async seed(): Promise<void> {
    const username = normalizeUsername(this.config.admin.username, 'ADMIN_USERNAME');
    const passwordHash = await this.passwords.hash(this.config.admin.password);
    const admin = await this.users.upsertAdmin({ username, passwordHash });
    this.logger.log(`Admin account "${admin.username}" is ready (id ${admin.id}).`);
  }
}
