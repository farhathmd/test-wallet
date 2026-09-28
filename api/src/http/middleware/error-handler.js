import { AppError } from '../../domain/errors.js';

/**
 * Central error translation: the single place that turns a thrown error into an HTTP response.
 *
 * Response shape is always `{ error: { code, message, details? } }`. Errors we raised ourselves
 * (`AppError`) are reported as-is; anything else is an internal bug and is logged with its stack but
 * reported as a generic 500, so SQL text, connection strings or stack traces never reach a client.
 *
 * @param {{ logger?: Console }} [options]
 */
export function createErrorHandler({ logger = console } = {}) {
  /**
   * @param {Error & { status?: number, type?: string }} error
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  return function errorHandler(error, req, res, next) {
    if (res.headersSent) {
      next(error);
      return;
    }

    if (error instanceof AppError) {
      if (error.status >= 500) {
        logger.error(`[api] ${req.method} ${req.originalUrl} -> ${error.status}`, error);
      }
      res.status(error.status).json({
        error: {
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        },
      });
      return;
    }

    // express.json() rejects malformed payloads before any handler runs.
    if (error.type === 'entity.parse.failed') {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Request body is not valid JSON.' },
      });
      return;
    }
    if (error.type === 'entity.too.large') {
      res.status(413).json({
        error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large.' },
      });
      return;
    }

    logger.error(`[api] unhandled error on ${req.method} ${req.originalUrl}`, error);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' },
    });
  };
}

/** Fallback for unknown routes: keeps 404s in the same JSON shape as every other error. */
export function notFoundHandler(req, res) {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.originalUrl} does not exist.`,
    },
  });
}
