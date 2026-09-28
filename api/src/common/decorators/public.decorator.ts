import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route as reachable without a token.
 *
 * Authentication is **on by default** (see JwtAuthGuard registered as a global guard in
 * app.module.ts): a new controller is therefore protected unless it opts out explicitly here, which
 * is the safe direction for a wallet API.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
