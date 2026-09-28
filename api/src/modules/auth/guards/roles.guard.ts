import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../../../common/decorators/roles.decorator';
import { RequestWithUser, Role } from '../../../common/types';
import { ForbiddenError } from '../../../domain/errors';

/**
 * Role gate for routes decorated with `@Roles(...)`.
 *
 * Registered globally *after* JwtAuthGuard, so by the time this runs the identity is already verified
 * and only the role has to be checked. Routes without the decorator are untouched, which keeps the
 * default "any authenticated user" behaviour of the wallet API.
 *
 * The role is read from the verified token, not from the database: an authenticated request
 * therefore costs no query just to answer "is this an admin?".
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const { user } = context.switchToHttp().getRequest<RequestWithUser>();
    if (!user || !required.includes(user.role)) {
      throw new ForbiddenError('Admin access is required for this operation.');
    }
    return true;
  }
}
