import { serializeAuthenticatedUser } from '../serializers/user.serializer.js';
import { parseLoginBody, parseRegisterBody } from '../validators/request.js';

/**
 * HTTP handlers for registration and login.
 *
 * Controllers stay thin on purpose: validate the request shape, call one service method, serialise
 * the result. Rejected promises are forwarded to the error handler by Express 5, so there is no
 * try/catch boilerplate here.
 *
 * @param {{ authService: object }} dependencies
 */
export function createAuthController({ authService }) {
  return {
    /** POST /register → 201 with the new user and a token. */
    async register(req, res) {
      const { username, password } = parseRegisterBody(req.body);
      const { user, token } = await authService.register({ username, password });
      res.status(201).json(serializeAuthenticatedUser(user, token));
    },

    /** POST /login → 200 with the user and a token. */
    async login(req, res) {
      const { username, password } = parseLoginBody(req.body);
      const { user, token } = await authService.login({ username, password });
      res.status(200).json(serializeAuthenticatedUser(user, token));
    },
  };
}
