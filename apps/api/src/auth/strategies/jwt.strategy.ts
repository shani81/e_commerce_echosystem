import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { MembershipStatus } from '@aicos/db';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

/** Claims embedded in the signed access token. */
export interface AccessTokenPayload {
  sub: string; // userId
  tid: string; // tenantId
  rid: string; // active roleId
  email: string;
}

/**
 * passport-jwt strategy ('jwt'). Verifies the HS256 access token against
 * `JWT_ACCESS_SECRET`, then re-resolves the membership/role from the database so
 * a revoked membership or deleted role immediately invalidates the token.
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
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('jwt.accessSecret'),
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
