import { ArgumentsHost, Logger, NotFoundException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AppError, InsufficientBalanceError, ServiceUnavailableError, UnauthorizedError, ValidationError } from '../../domain/errors';
import { AllExceptionsFilter } from './all-exceptions.filter';

/** Minimal Response double: records what would have been sent. */
function createResponseDouble() {
  const response = {
    headersSent: false,
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      response.statusCode = code;
      return response;
    },
    json(payload: unknown) {
      response.body = payload;
      return response;
    },
  };
  return response;
}

/** The only part of an ArgumentsHost the filter uses. */
function createHost(response: ReturnType<typeof createResponseDouble>, request: Partial<Request> = {}) {
  const req = { method: 'POST', originalUrl: '/api/v1/topup', ...request } as Request;
  return {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => response as unknown as Response,
    }),
  } as unknown as ArgumentsHost;
}

const filter = new AllExceptionsFilter();

/** The filter logs through Nest's Logger; the tests assert on it without printing noise. */
let logged: string[];

beforeEach(() => {
  logged = [];
  jest.spyOn(Logger.prototype, 'error').mockImplementation((message: unknown) => {
    logged.push(String(message));
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

function run(exception: unknown, request: Partial<Request> = {}) {
  const response = createResponseDouble();
  filter.catch(exception, createHost(response, request));
  return response;
}

describe('common/filters/all-exceptions.filter', () => {
  it('translates a domain error into its status, code, message and details', () => {
    const response = run(new InsufficientBalanceError('Insufficient balance.', { balance: 5 }));

    expect(response.statusCode).toBe(400);
    expect(response.body).toEqual({
      error: {
        code: 'INSUFFICIENT_BALANCE',
        message: 'Insufficient balance.',
        details: { balance: 5 },
      },
    });
  });

  it('maps any AppError status without special casing it', () => {
    for (const [error, status] of [
      [new ValidationError('bad input'), 400],
      [new AppError('teapot', { code: 'TEAPOT', status: 418 }), 418],
      [new ServiceUnavailableError('Database is unreachable.'), 503],
    ] as const) {
      const response = run(error);

      expect(response.statusCode).toBe(status);
      expect((response.body as { error: { message: string } }).error.message).toBe(error.message);
    }
  });

  it('does not log a client mistake: a 4xx is not an incident', () => {
    run(new ValidationError('bad input'));
    run(new UnauthorizedError('Authorization token is required.'));
    run(new NotFoundException(), { method: 'GET', originalUrl: '/api/v1/nope' });

    expect(logged).toEqual([]);
  });

  it('does not log a degraded health probe either, which an orchestrator polls by design', () => {
    const response = run(new ServiceUnavailableError('Database is unreachable.'));

    expect(response.statusCode).toBe(503);
    expect(logged).toEqual([]);
  });

  it('hides an unexpected error behind a generic 500 and logs it with its stack', () => {
    const leaking = new Error('relation "users" does not exist at postgres://user:pw@host');

    const response = run(leaking);

    expect(response.statusCode).toBe(500);
    expect(response.body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' },
    });
    expect(JSON.stringify(response.body)).not.toContain('postgres://');
    expect(logged).toHaveLength(1);
  });

  it('reports malformed JSON and oversized payloads as client errors', () => {
    for (const [type, status] of [
      ['entity.parse.failed', 400],
      ['entity.too.large', 413],
    ] as const) {
      const response = run(Object.assign(new Error('body parser'), { type }));

      expect(response.statusCode).toBe(status);
    }
  });

  it('answers an unknown route with the standard error shape, not the router wording', () => {
    const response = run(new NotFoundException('Cannot POST /api/v1/topup'), {
      method: 'GET',
      originalUrl: '/api/v1/nope',
    });

    expect(response.statusCode).toBe(404);
    expect(response.body).toEqual({
      error: { code: 'NOT_FOUND', message: 'Route GET /api/v1/nope does not exist.' },
    });
  });

  it('does nothing when the response has already started', () => {
    const response = createResponseDouble();
    response.headersSent = true;

    filter.catch(new Error('too late'), createHost(response));

    expect(response.body).toBeUndefined();
    expect(response.statusCode).toBe(0);
  });
});
