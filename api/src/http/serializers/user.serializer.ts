import type { Role } from '../../common/types';
import { moneyToNumber, Money } from '../../domain/money';
import { toIsoTimestamp } from './timestamp';

/**
 * Outgoing user/balance payloads.
 *
 * Every field is picked explicitly rather than spread from the row: `password_hash` therefore cannot
 * leak into a response even if the row type grows a new column later.
 */
export interface SerializedUser {
  id: number;
  username: string;
  role: Role;
  balance: number;
  created_at: string;
}

/** The shape of a user row this serializer accepts (a subset of the Prisma model). */
export interface SerializedUserSource {
  id: number;
  username: string;
  role: Role;
  balance: Money | number | string;
  createdAt: Date | string;
}

export function serializeUser(user: SerializedUserSource): SerializedUser {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    balance: moneyToNumber(user.balance),
    created_at: toIsoTimestamp(user.createdAt),
  };
}

/** /register and /login answer with the user plus the bearer token to use from then on. */
export function serializeAuthenticatedUser(
  user: SerializedUserSource,
  token: string,
): SerializedUser & { token: string } {
  return { ...serializeUser(user), token };
}

export function serializeBalance(balance: Money | number | string): { balance: number } {
  return { balance: moneyToNumber(balance) };
}
