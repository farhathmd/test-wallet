import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../../../common/decorators/public.decorator';
import { RequestWithUser } from '../../../common/types';
import { UnauthorizedError } from '../../../domain/errors';
import { TokenService } from '../token.service';

/**
 * Global authentication guard.
 *
 * Registered once (APP_GUARD in AuthModule) so every route requires a valid token unless it is
 * explicitly marked `@Public()`. Verification is purely cryptographic — no database round trip — so
 * this adds effectively zero latency to each authenticated request.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokenService: TokenService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request & RequestWithUser>();
    const token = this.tokenService.extractFrom(request.get('authorization'));
    if (!token) {
      throw new UnauthorizedError('Authorization token is required.');
    }
    request.user = this.tokenService.verify(token);
    return true;
  }
}
