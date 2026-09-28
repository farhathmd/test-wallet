import { createHealthController } from './http/controllers/health.controller.js';
import { createAuthController } from './http/controllers/auth.controller.js';
import { createReportingController } from './http/controllers/reporting.controller.js';
import { createWalletController } from './http/controllers/wallet.controller.js';
import { createAuthMiddleware } from './http/middleware/auth.js';
import { createTransactionRepository } from './repositories/transaction.repository.js';
import { createUserRepository } from './repositories/user.repository.js';
import { createAuthService } from './services/auth.service.js';
import { createJwtService } from './services/jwt.service.js';
import { createPasswordService } from './services/password.service.js';
import { createReportingService } from './services/reporting.service.js';
import { createWalletService } from './services/wallet.service.js';
import { createUnitOfWork } from './db/unit-of-work.js';

/**
 * Composition root: the one place that knows how the pieces fit together.
 *
 * Repositories are bound to either the pool (reads) or a transaction client (writes) by the same
 * factory, so no service ever imports `pg`, and swapping a dependency (a fake in a unit test, a
 * different store later) is a change to this file only.
 *
 * @param {{ config: object, pool: import('pg').Pool }} deps
 */
export function createContainer({ config, pool }) {
  const passwordService = createPasswordService();
  const jwtService = createJwtService({
    secret: config.jwt.secret,
    expiresIn: config.jwt.expiresIn,
  });

  /** Fresh repositories for a transaction client — used by the unit of work. */
  const createRepositories = (db) => ({
    users: createUserRepository(db),
    transactions: createTransactionRepository(db),
  });

  const userRepository = createUserRepository(pool);
  const transactionRepository = createTransactionRepository(pool);
  const unitOfWork = createUnitOfWork(pool, createRepositories);

  const services = {
    authService: createAuthService({ userRepository, passwordService, jwtService }),
    walletService: createWalletService({ userRepository, unitOfWork }),
    reportingService: createReportingService({ transactionRepository, userRepository }),
  };

  const controllers = {
    health: createHealthController({ pool }),
    auth: createAuthController(services),
    wallet: createWalletController(services),
    reporting: createReportingController(services),
  };

  const middleware = createAuthMiddleware({ jwtService });

  return { services, controllers, middleware, passwordService, jwtService, unitOfWork };
}
