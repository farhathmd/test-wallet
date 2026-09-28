import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import type { SignOptions } from 'jsonwebtoken';
import { APP_CONFIG } from '../../config/config.module';
import type { AppConfig } from '../../config/configuration';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AdminSeeder } from './admin-seeder.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

/**
 * Authentication: credential use cases, token handling and — through the two global guards — the
 * security policy of the whole API.
 *
 * Registering the guards here (`APP_GUARD`) rather than per controller is what makes authentication
 * the default: a new route is protected unless it says `@Public()`. Guard order matters and is the
 * declaration order below: JwtAuthGuard verifies the token and puts the identity on the request,
 * RolesGuard then checks the role of that identity.
 */
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        secret: config.jwt.secret,
        signOptions: {
          algorithm: 'HS256',
          // Typed as a template literal union by jsonwebtoken; the value is validated configuration.
          expiresIn: config.jwt.expiresIn as SignOptions['expiresIn'],
        },
        // HS256 only: accepting the token's own `alg` header is how algorithm-confusion attacks start.
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    TokenService,
    AdminSeeder,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [AuthService, PasswordService, TokenService, AdminSeeder],
})
export class AuthModule {}
