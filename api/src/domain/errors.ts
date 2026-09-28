/**
 * Domain errors.
 *
 * Every error that the API intentionally reports to a client is an `AppError`, which carries the
 * HTTP status and a stable machine readable `code`. Anything else that escapes a service is a bug
 * and is reported as a generic 500 by the exception filter, so internal details never leak.
 *
 * Kept dependency free on purpose: services, repositories and domain rules can throw these without
 * knowing anything about NestJS or Express.
 */
export class AppError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly details?: Record<string, unknown>;

  constructor(message: string, options: { code: string; status: number; details?: Record<string, unknown> }) {
    super(message);
    this.name = new.target.name;
    this.code = options.code;
    this.status = options.status;
    this.details = options.details;
    Error.captureStackTrace?.(this, new.target);
  }
}

/** 400 — the request is syntactically fine but violates a rule we can explain to the caller. */
export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, { code: 'VALIDATION_ERROR', status: 400, details });
  }
}

/** 400 — dedicated code so clients can highlight "not enough funds" specifically. */
export class InsufficientBalanceError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, { code: 'INSUFFICIENT_BALANCE', status: 400, details });
  }
}

/** 401 — missing, malformed, expired or unknown-identity token. */
export class UnauthorizedError extends AppError {
  constructor(message: string) {
    super(message, { code: 'UNAUTHORIZED', status: 401 });
  }
}

/** 403 — authenticated, but not allowed to perform this action. */
export class ForbiddenError extends AppError {
  constructor(message: string) {
    super(message, { code: 'FORBIDDEN', status: 403 });
  }
}

/** 404 — referenced resource does not exist. */
export class NotFoundError extends AppError {
  constructor(message: string) {
    super(message, { code: 'NOT_FOUND', status: 404 });
  }
}

/** 409 — uniqueness violation, e.g. registering an existing username. */
export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, { code: 'CONFLICT', status: 409 });
  }
}

/**
 * 503 — a dependency the API needs is not available right now.
 *
 * Only `/health` reports this today: it is the one endpoint whose job is to say "the API process is
 * up but it cannot serve traffic", which is what an orchestrator needs to stop routing to an instance.
 */
export class ServiceUnavailableError extends AppError {
  constructor(message: string) {
    super(message, { code: 'SERVICE_UNAVAILABLE', status: 503 });
  }
}
