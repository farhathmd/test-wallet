import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AppError } from '../../domain/errors';

/** The only error payload shape this API produces. */
interface ErrorPayload {
  error: { code: string; message: string; details?: Record<string, unknown> };
}

/**
 * Central error translation: the single place that turns a thrown error into an HTTP response.
 *
 * Response shape is always `{ error: { code, message, details? } }`. Errors we raised ourselves
 * (`AppError`, plus the body parser and the router) are reported as-is; anything else is an internal
 * bug and is logged with its stack but reported as a generic 500, so SQL text, connection strings or
 * stack traces never reach a client.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();

    if (response.headersSent) {
      // Nothing sensible left to do: the response is already on the wire.
      return;
    }

    const payload = this.toPayload(exception, request);
    const status = statusOf(exception, payload);

    if (shouldLog(status, payload)) {
      this.logger.error(
        `${request.method} ${request.originalUrl} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).json(payload);
  }

  /** Translate a thrown value into the response body, without deciding the status code. */
  private toPayload(exception: unknown, request: Request): ErrorPayload {
    if (exception instanceof AppError) {
      return {
        error: {
          code: exception.code,
          message: exception.message,
          ...(exception.details ? { details: exception.details } : {}),
        },
      };
    }

    // The JSON body parser rejects malformed payloads before any handler runs.
    const parserError = exception as { type?: string };
    if (parserError?.type === 'entity.parse.failed') {
      return { error: { code: 'VALIDATION_ERROR', message: 'Request body is not valid JSON.' } };
    }
    if (parserError?.type === 'entity.too.large') {
      return { error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large.' } };
    }

    // Unknown routes: Nest's router reports "Cannot GET /api/v1/whatever"; keep the documented shape.
    if (exception instanceof NotFoundException) {
      return {
        error: {
          code: 'NOT_FOUND',
          message: `Route ${request.method} ${request.originalUrl} does not exist.`,
        },
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return {
        error: {
          code: status === 400 ? 'VALIDATION_ERROR' : statusToCode(status),
          message: exception.message,
        },
      };
    }

    return { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' } };
  }
}

/** Status code of the response: the error's own status when it has one, 500 otherwise. */
function statusOf(exception: unknown, payload: ErrorPayload): number {
  if (exception instanceof AppError) return exception.status;
  if (exception instanceof HttpException) return exception.getStatus();
  // A body parser rejection is a client error even when the driver forgot to set `status`.
  const parserStatus = BODY_PARSER_STATUSES[(exception as { type?: string })?.type ?? ''];
  if (parserStatus) return parserStatus;
  const parserError = exception as { status?: number; statusCode?: number };
  const status = parserError?.status ?? parserError?.statusCode;
  return typeof status === 'number' && status >= 400 && status < 600 ? status : 500;
}

/** `type` values express-body-parser puts on the errors it rejects a request with. */
const BODY_PARSER_STATUSES: Record<string, number> = {
  'entity.parse.failed': 400,
  'entity.too.large': 413,
};

/**
 * Whether a failure deserves an error log: only a real incident (a 5xx) does.
 *
 * A 4xx is the caller's mistake and is already described by the response, while a degraded `/health`
 * answer is a normal state an orchestrator polls for. Logging either would drown the log that is
 * supposed to show genuine failures.
 */
function shouldLog(status: number, payload: ErrorPayload): boolean {
  return status >= 500 && payload.error.code !== 'SERVICE_UNAVAILABLE';
}

function statusToCode(status: number): string {
  switch (status) {
    case 400:
      return 'VALIDATION_ERROR';
    case 401:
      return 'UNAUTHORIZED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 413:
      return 'PAYLOAD_TOO_LARGE';
    default:
      return status >= 500 ? 'INTERNAL_ERROR' : 'HTTP_ERROR';
  }
}
