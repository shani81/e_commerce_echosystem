import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';

/**
 * Auth module — owns the passport-jwt strategy and the JwtService used both for
 * signing (AuthService) and verification (TenantMiddleware via the exported
 * JwtModule). Per-call secrets are passed explicitly at sign/verify time so the
 * single JwtService can mint both access and refresh tokens.
 */
@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    // No global key: each call passes its key explicitly — RS256 access tokens
    // sign with the private key / verify with the public key; HS256 refresh
    // tokens use the refresh secret. Per-token expiry is set at sign time.
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService, JwtModule, PassportModule],
})
export class AuthModule {}
