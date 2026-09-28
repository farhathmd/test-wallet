import { ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { Public } from '../../../common/decorators/public.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { RequestWithUser, Role } from '../../../common/types';
import { ForbiddenError, UnauthorizedError } from '../../../domain/errors';
import { TokenService } from '../token.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';

const SECRET = 'unit-test-secret-that-is-long-enough-01';

let tokens: TokenService;
let jwtAuthGuard: JwtAuthGuard;
let rolesGuard: RolesGuard;

beforeAll(() => {
  tokens = new TokenService(new JwtService({ secret: SECRET }));
  const reflector = new Reflector();
  jwtAuthGuard = new JwtAuthGuard(reflector, tokens);
  rolesGuard = new RolesGuard(reflector);
});

/** Routes used as metadata carriers: one public, one protected, one admin-only. */
class TestController {
  @Public()
  publicRoute(): void {}

  protectedRoute(): void {}

  @Roles('admin')
  adminRoute(): void {}
}

const userToken = (id = 1, role: Role = 'user') => tokens.sign({ id, username: 'alice', role });

/** A request with just the `get()` the guard uses, plus the `user` the guard writes. */
function request(header?: string): Request & RequestWithUser {
  return {
    get: (name: string) => (name.toLowerCase() === 'authorization' ? header : undefined),
  } as unknown as Request & RequestWithUser;
}

/** The only part of a Nest ExecutionContext the guards touch. */
function contextFor(handler: () => void, req: Request & RequestWithUser): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => TestController,
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe('modules/auth/guards (JwtAuthGuard + RolesGuard)', () => {
  it('accepts a Bearer token and attaches the authenticated user', () => {
    const req = request(`Bearer ${userToken()}`);

    expect(jwtAuthGuard.canActivate(contextFor(TestController.prototype.protectedRoute, req))).toBe(true);
    expect(req.user).toEqual({ id: 1, username: 'alice', role: 'user' });
  });

  it('accepts a bare token, a "Token" prefix and extra spacing', () => {
    for (const header of [
      userToken(),
      `token ${userToken()}`,
      `Bearer   ${userToken()}  `,
      `  ${userToken()}  `,
    ]) {
      const req = request(header);

      expect(jwtAuthGuard.canActivate(contextFor(TestController.prototype.protectedRoute, req))).toBe(true);
      expect(req.user?.id).toBe(1);
    }
  });

  it('rejects a missing, empty or malformed Authorization header', () => {
    for (const header of [undefined, '', '   ', 'Bearer', 'Bearer ', 'not-a-token']) {
      expect(() => jwtAuthGuard.canActivate(contextFor(TestController.prototype.protectedRoute, request(header)))).toThrow(
        UnauthorizedError,
      );
    }
  });

  it('rejects a token signed for a different secret', () => {
    const foreign = new TokenService(new JwtService({ secret: 'a-completely-different-secret-0123456789' }));
    const forged = foreign.sign({ id: 9, username: 'mallory', role: 'admin' });

    expect(() =>
      jwtAuthGuard.canActivate(contextFor(TestController.prototype.protectedRoute, request(forged))),
    ).toThrow(UnauthorizedError);
  });

  it('lets a @Public() route through without a token and never populates a user', () => {
    const req = request();

    expect(jwtAuthGuard.canActivate(contextFor(TestController.prototype.publicRoute, req))).toBe(true);
    expect(req.user).toBeUndefined();
  });

  it('grants a role only to the matching user', () => {
    const adminRequest = request();
    adminRequest.user = { id: 2, username: 'admin', role: 'admin' };
    expect(rolesGuard.canActivate(contextFor(TestController.prototype.adminRoute, adminRequest))).toBe(true);

    const userRequest = request();
    userRequest.user = { id: 1, username: 'alice', role: 'user' };
    expect(() => rolesGuard.canActivate(contextFor(TestController.prototype.adminRoute, userRequest))).toThrow(
      ForbiddenError,
    );
  });

  it('treats a missing user as a failed role check, not as a pass', () => {
    // Defence in depth: if the guard order were ever reversed, this must still deny.
    expect(() => rolesGuard.canActivate(contextFor(TestController.prototype.adminRoute, request()))).toThrow(
      ForbiddenError,
    );
  });

  it('leaves routes without @Roles() to the authentication guard alone', () => {
    const req = request();
    req.user = { id: 1, username: 'alice', role: 'user' };

    expect(rolesGuard.canActivate(contextFor(TestController.prototype.protectedRoute, req))).toBe(true);
  });
});
