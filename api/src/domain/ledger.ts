import { ValidationError } from './errors';

/**
 * Ledger vocabulary shared by the request validators, the repositories and the serializers.
 *
 * The values mirror `TransactionType` in prisma/schema.prisma. They are declared here as well so the
 * HTTP layer can validate a query parameter without importing the generated Prisma client.
 */
export const TRANSACTION_TYPES = ['topup', 'transfer'] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

/** Which way the money moved for the wallet that is looking at the row. */
export const DIRECTIONS = ['credit', 'debit'] as const;
export type Direction = (typeof DIRECTIONS)[number];

/**
 * @param value raw query parameter
 * @param allowed the accepted values
 * @param field name used in error messages
 * @returns the value if it is one of `allowed`, undefined for an absent/blank value
 * @throws {ValidationError}
 */
export function parseEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string,
): T | undefined {
  const raw = typeof value === 'string' ? value.trim() : value;
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (typeof raw !== 'string' || !allowed.includes(raw as T)) {
    throw new ValidationError(`"${field}" must be one of: ${allowed.join(', ')}.`, { field });
  }
  return raw as T;
}
