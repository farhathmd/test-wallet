import { SetMetadata } from '@nestjs/common';
import type { Role } from '../types';

export const ROLES_KEY = 'roles';

/**
 * Restrict a route to the given roles, enforced by `RolesGuard` (registered globally).
 *
 * No route needs it today: the only role rule in the specification depends on a *query parameter*
 * (`GET /transactions?username=<other>`), not on a route, so it is decided in `ReportingService` where
 * it can be explained as a 403. This decorator stays as the declarative mechanism for a route that
 * genuinely is admin-only, and its behaviour is covered by `guards.spec.ts`.
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
