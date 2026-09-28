import { Router } from 'express';

/**
 * Route table — the map of the public API, versioned under `/api/v1`.
 *
 * Note the ordering intent: `/transactions/top` is declared before `/transactions` so the literal
 * segment always wins, and everything except register/login/health sits behind `authenticate`.
 * `requireRole('admin')` is available for future admin-only endpoints and is already enforced where
 * it matters (the `?username=` escape hatch of the listing, inside the reporting service).
 *
 * @param {{ controllers: object, middleware: { authenticate: Function, requireRole: Function } }} deps
 */
export function createRouter({ controllers, middleware }) {
  const router = Router();
  const { authenticate } = middleware;

  router.get('/health', controllers.health.check);

  router.post('/register', controllers.auth.register);
  router.post('/login', controllers.auth.login);

  router.get('/balance', authenticate, controllers.wallet.getBalance);
  router.post('/topup', authenticate, controllers.wallet.topup);
  router.post('/transfer', authenticate, controllers.wallet.transfer);

  router.get('/transactions/top', authenticate, controllers.reporting.topTransactions);
  router.get('/transactions', authenticate, controllers.reporting.listTransactions);
  router.get('/users/top', authenticate, controllers.reporting.topUsers);

  return router;
}
