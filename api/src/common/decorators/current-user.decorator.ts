import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { RequestWithUser } from '../types';
import { UnauthorizedError } from '../../domain/errors';

/**
 * Injects the verified identity of the caller.
 *
 * The value is put on the request by JwtAuthGuard; a missing user means a route forgot `@Public()`
 * or the guard was bypassed, which is a programming error worth failing loudly on (401 rather than a
 * confusing 500 further down the stack).
 */
export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const request = context.switchToHttp().getRequest<RequestWithUser>();
  if (!request.user) {
    throw new UnauthorizedError('Authorization token is required.');
  }
  return request.user;
});
