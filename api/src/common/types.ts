/** Roles a user can hold. Mirrors the `UserRole` enum in prisma/schema.prisma. */
export type Role = 'user' | 'admin';

/** Identity carried by a verified JWT — what every controller receives as `@CurrentUser()`. */
export interface AuthenticatedUser {
  id: number;
  username: string;
  role: Role;
}

/** A request whose `user` was populated by the authentication guard. */
export interface RequestWithUser {
  user?: AuthenticatedUser;
}
