import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy, type JwtFromRequestFunction } from 'passport-jwt';
import type { Request } from 'express';
import { MembershipStatus } from '@aicos/db';
import { PrismaService } from '../../prisma/prisma.service';
import { ACCESS_COOKIE } from '../auth-cookies';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

/** Read the access token from the httpOnly cookie first, then the Bearer header. */
const fromCookie: JwtFromRequestFunction = (req: Request & { cookies?: Record<string, string> }) =>
  req?.cookies?.[ACCESS_COOKIE] ?? null;

/** Claims embedded in the signed access token. */
export interface AccessTokenPayload {
  sub: string; // userId
  tid: string; // tenantId
  rid: string; // active roleId
  email: string;
}

/**
 * passport-jwt strategy ('jwt'). Verifies the RS256 access token with the JWT
 * PUBLIC key, then re-resolves the membership/role from the database so a
 * revoked membership or deleted role immediately invalidates the token.
 *
 * The membership/role lookup spans tenants (we resolve which tenant this token
 * is for), so it runs through `asSystem` — a sanctioned RLS-bypass auth path.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      // Browsers send the httpOnly cookie; programmatic clients (tests, curl,
      // the worker) keep using the Authorization header.
      jwtFromRequest: ExtractJwt.fromExtractors([
        fromCookie,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      // Verify with the RS256 PUBLIC key, and PIN the algorithm so an attacker
      // can't downgrade to HS256 and forge tokens using the public key as the
      // HMAC secret (the classic RS/HS confusion attack).
      secretOrKey: config.getOrThrow<string>('jwt.accessPublicKey'),
      algorithms: ['RS256'],
    });
  }

  async validate(payload: AccessTokenPayload): Promise<AuthenticatedUser> {
    const membership = await this.prisma.asSystem((tx) =>
      tx.membership.findUnique({
        where: { tenantId_userId: { tenantId: payload.tid, userId: payload.sub } },
        include: { role: true, user: true },
      }),
    );

    if (!membership || membership.status !== MembershipStatus.ACTIVE) {
      throw new UnauthorizedException('Membership is not active');
    }
    if (membership.user.deletedAt) {
      throw new UnauthorizedException('User account is disabled');
    }

    const rawPermissions: unknown = membership.role.permissions;
    const permissions = Array.isArray(rawPermissions)
      ? rawPermissions.filter((p): p is string => typeof p === 'string')
      : [];

    return {
      userId: membership.userId,
      tenantId: membership.tenantId,
      email: membership.user.email,
      roleId: membership.roleId,
      roleType: membership.role.type,
      permissions,
    };
  }
}
