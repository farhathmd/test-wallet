import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { ParseRequest } from '../../http/pipes/request-parse.pipe';
import { parseLoginBody, parseRegisterBody } from '../../http/dto/auth.dto';
import type { RegisterInput, LoginInput } from '../../http/dto/auth.dto';
import { serializeAuthenticatedUser, type SerializedUser } from '../../http/serializers/user.serializer';
import { AuthService } from './auth.service';

/**
 * Authentication endpoints.
 *
 * Thin by design: validate the body (parser pipe), delegate to the service, serialise the result. No
 * rule and no query lives here.
 */
@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** 201 with the new wallet and a token to use immediately. */
  @Public()
  @Post('register')
  async register(
    @Body(ParseRequest(parseRegisterBody)) input: RegisterInput,
  ): Promise<SerializedUser & { token: string }> {
    const { user, token } = await this.auth.register(input);
    return serializeAuthenticatedUser(user, token);
  }

  /** 200 (not the POST default of 201): nothing was created, the caller signed in. */
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(
    @Body(ParseRequest(parseLoginBody)) input: LoginInput,
  ): Promise<SerializedUser & { token: string }> {
    const { user, token } = await this.auth.login(input);
    return serializeAuthenticatedUser(user, token);
  }
}
