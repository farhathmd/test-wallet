import { toAmount } from '../../domain/money.js';
import { toIsoTimestamp } from './timestamp.js';

/**
 * Outbound user representation.
 *
 * Serializers are the only place that decides what a response looks like. `password_hash` is simply
 * never selected here, so a hash cannot leak through a forgotten spread operator — services hand
 * over whole user objects on purpose.
 *
 * @param {object} user domain user
 */
export function serializeUser(user) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    balance: toAmount(user.balance),
    created_at: toIsoTimestamp(user.createdAt),
  };
}

/**
 * User details plus the token that authenticates the following requests
 * (`POST /register` and `POST /login`).
 *
 * @param {object} user
 * @param {string} token
 */
export function serializeAuthenticatedUser(user, token) {
  return { ...serializeUser(user), token };
}

/**
 * `GET /balance` response.
 * @param {number} balance
 */
export function serializeBalance(balance) {
  return { balance: toAmount(balance) };
}
