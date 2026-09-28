import { normalizeUsername } from '../../domain/username';
import type { Money } from '../../domain/money';
import { requiredField, requireJsonObject } from './parsers';

/**
 * POST /topup and POST /transfer.
 *
 * The amount is forwarded exactly as it arrived (typed as `unknown`): the wallet service decides what
 * a valid amount is, so `0`, `10000000` and `1.005` fail there with the documented messages instead
 * of failing here with different ones.
 */
export interface TopupInput {
  amount: unknown;
}

export interface TransferInput {
  toUsername: string;
  amount: unknown;
}

export function parseTopupBody(body: unknown): TopupInput {
  const object = requireJsonObject(body);
  return { amount: requiredField(object, 'amount') };
}

export function parseTransferBody(body: unknown): TransferInput {
  const object = requireJsonObject(body);
  return {
    toUsername: normalizeUsername(requiredField(object, 'to_username'), 'to_username'),
    amount: requiredField(object, 'amount'),
  };
}
