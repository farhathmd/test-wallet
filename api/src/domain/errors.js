/**
 * Domain errors.
 *
 * Every error that the API intentionally reports to a client is an `AppError`, which carries the
 * HTTP status and a stable machine readable `code`. Anything else that escapes a service is a bug
 * and is reported as a generic 500 by the error handler, so internal details never leak.
 *
 * Kept dependency free on purpose: services can throw these without knowing about Express.
 */
export class AppError extends Error {
  /**
   * @param {string} message human readable, safe to expose
   * @param {{ code: string, status: number, details?: object }} options
   */
  constructor(message, { code, status, details }) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.status = status;
    this.details = details;
    Error.captureStackTrace?.(this, new.target);
  }
}

/** 400 — the request is syntactically fine but violates a rule we can explain to the caller. */
export class ValidationError extends AppError {
  constructor(message, details) {
    super(message, { code: 'VALIDATION_ERROR', status: 400, details });
  }
}

/** 400 — dedicated code so clients can highlight "not enough funds" specifically. */
export class InsufficientBalanceError extends AppError {
  constructor(message, details) {
    super(message, { code: 'INSUFFICIENT_BALANCE', status: 400, details });
  }
}

/** 401 — missing, malformed, expired or unknown-identity token. */
export class UnauthorizedError extends AppError {
  constructor(message) {
    super(message, { code: 'UNAUTHORIZED', status: 401 });
  }
}

/** 403 — authenticated, but not allowed to perform this action. */
export class ForbiddenError extends AppError {
  constructor(message) {
    super(message, { code: 'FORBIDDEN', status: 403 });
  }
}

/** 404 — referenced resource does not exist. */
export class NotFoundError extends AppError {
  constructor(message) {
    super(message, { code: 'NOT_FOUND', status: 404 });
  }
}

/** 409 — uniqueness violation, e.g. registering an existing username. */
export class ConflictError extends AppError {
  constructor(message) {
    super(message, { code: 'CONFLICT', status: 409 });
  }
}
