import { describe, expect, it, vi, beforeEach } from 'vitest';
import { get, post } from '../api/client';
import { fetchTopUsers, toAmount, topup, transfer } from '../api/wallet.api';

/**
 * The request bodies the money endpoints actually send.
 *
 * This is the one place the HTTP boundary is asserted rather than mocked — it exists because the API
 * rejected the first version of these calls: its DTO requires a JSON number, so `{"amount":"250.00"}`
 * fails with `"amount" must be a finite number.` Verified against a live API with curl, and pinned here
 * so that change needs a deliberate edit.
 */
vi.mock('../api/client', () => ({ get: vi.fn(), post: vi.fn() }));

const getMock = vi.mocked(get);
const postMock = vi.mocked(post);

beforeEach(() => {
  getMock.mockReset();
  postMock.mockReset().mockResolvedValue(undefined);
});

describe('amount parsing', () => {
  it('parses the typed decimal into a JSON number', () => {
    expect(toAmount('250.00')).toBe(250);
    expect(toAmount(' 25.50 ')).toBe(25.5);
    expect(toAmount('9999999.99')).toBe(9999999.99);
    expect(toAmount('-5')).toBe(-5); // signed here; the API decides that it is not allowed
  });

  it('refuses text that is not a number, and a blank field, instead of sending null or 0', () => {
    expect(() => toAmount('1,50')).toThrow(/not a number/i);
    expect(() => toAmount('abc')).toThrow(/not a number/i);
    expect(() => toAmount('')).toThrow(/enter an amount/i);
    expect(() => toAmount('   ')).toThrow(/enter an amount/i);
  });
});

describe('money requests', () => {
  it('tops up with a number, not the string from the input', async () => {
    await topup('250.00');

    expect(postMock).toHaveBeenCalledWith('/topup', { amount: 250 });
  });

  it('transfers with to_username, spelled the way the API spells it', async () => {
    await transfer('bob', '25.50');

    expect(postMock).toHaveBeenCalledWith('/transfer', { to_username: 'bob', amount: 25.5 });
  });

  it('never reaches the network for an amount it cannot parse', () => {
    expect(() => topup('1,50')).toThrow(/not a number/i);
    expect(() => transfer('bob', '1,50')).toThrow(/not a number/i);
    expect(postMock).not.toHaveBeenCalled();
  });

  it('asks for top users with the limit the suggestion list uses', async () => {
    getMock.mockResolvedValue([{ username: 'bob', transacted_value: 10 }]);

    await fetchTopUsers(50);

    expect(getMock).toHaveBeenCalledWith('/users/top', { limit: 50 });
  });
});
