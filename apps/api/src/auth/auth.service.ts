import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import {
  MembershipStatus,
  type Prisma,
  RoleType,
  TenantStatus,
  UserStatus,
} from '@aicos/db';
import { PrismaService } from '../prisma/prisma.service';
import { ROLE_DEFINITIONS, ROLE_PERMISSIONS } from '../common/rbac/permissions';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import type { SignupDto } from './dto/signup.dto';
import type { LoginDto } from './dto/login.dto';
import type { AccessTokenPayload } from './strategies/jwt.strategy';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: string;
}

interface RefreshTokenPayload {
  sub: string; // userId
  tid: string; // tenantId
  sid: string; // sessionId — ties the token to a rotatable Session row
}

/**
 * Identity & session management for AICOS.
 *
 * Cross-tenant lookups (which tenant a user logs into, provisioning a brand-new
 * tenant) inherently span the RLS boundary, so all DB work here goes through
 * `prisma.asSystem(...)`. These are the few, auditable RLS-bypass call sites.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly accessPrivateKey: string;
  private readonly refreshSecret: string;
  private readonly accessTtl: string;
  private readonly refreshTtl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    config: ConfigService,
  ) {
    this.accessPrivateKey = config.getOrThrow<string>('jwt.accessPrivateKey');
    this.refreshSecret = config.getOrThrow<string>('jwt.refreshSecret');
    this.accessTtl = config.get<string>('jwt.accessTtl') ?? '15m';
    this.refreshTtl = config.get<string>('jwt.refreshTtl') ?? '30d';
  }

  /**
   * Self-serve signup. Provisions a Tenant with its built-in roles, the owner
   * User, and the owner Membership — atomically inside a single system
   * transaction — then issues a token pair.
   */
  async signup(dto: SignupDto): Promise<TokenPair> {
    const email = dto.email.toLowerCase().trim();
    const slug = this.normaliseSlug(dto.tenantSlug ?? dto.tenantName);
    const passwordHash = await argon2.hash(dto.password);

    const result = await this.prisma.asSystem(async (tx) => {
      const existingUser = await tx.user.findUnique({ where: { email } });
      if (existingUser) {
        throw new ConflictException('An account with this email already exists');
      }
      const existingTenant = await tx.tenant.findUnique({ where: { slug } });
      if (existingTenant) {
        throw new ConflictException(`Tenant slug "${slug}" is already taken`);
      }

      const tenant = await tx.tenant.create({
        data: {
          slug,
          name: dto.tenantName.trim(),
          status: TenantStatus.TRIAL,
        },
      });

      // Seed the built-in tenant roles; keep the owner role for the membership.
      let ownerRoleId: string | null = null;
      for (const def of ROLE_DEFINITIONS) {
        const role = await tx.role.create({
          data: {
            tenantId: tenant.id,
            type: def.type,
            name: def.name,
            description: def.description,
            permissions: (ROLE_PERMISSIONS[def.type] ??
              []) as Prisma.InputJsonValue,
            isSystem: true,
          },
        });
        if (def.type === RoleType.STORE_OWNER) ownerRoleId = role.id;
      }
      if (!ownerRoleId) {
        // Unreachable — ROLE_DEFINITIONS always includes STORE_OWNER.
        throw new Error('Owner role was not seeded');
      }

      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          fullName: dto.fullName.trim(),
          status: UserStatus.ACTIVE,
          emailVerified: false,
          lastLoginAt: new Date(),
        },
      });

      await tx.membership.create({
        data: {
          tenantId: tenant.id,
          userId: user.id,
          roleId: ownerRoleId,
          status: MembershipStatus.ACTIVE,
          acceptedAt: new Date(),
        },
      });

      return { tenant, user, roleId: ownerRoleId };
    });

    this.logger.log(`Provisioned tenant ${result.tenant.id} for ${email}`);

    return this.issueTokens({
      userId: result.user.id,
      tenantId: result.tenant.id,
      roleId: result.roleId,
      email,
    });
  }

  /**
   * Verify credentials against the user's (single, for Phase 0) active
   * membership and issue tokens. Uses argon2 for password verification.
   */
  async login(dto: LoginDto): Promise<TokenPair> {
    const email = dto.email.toLowerCase().trim();

    const data = await this.prisma.asSystem(async (tx) => {
      const user = await tx.user.findUnique({ where: { email } });
      if (!user || !user.passwordHash || user.deletedAt) return null;

      const ok = await argon2.verify(user.passwordHash, dto.password);
      if (!ok) return null;

      const membership = await tx.membership.findFirst({
        where: { userId: user.id, status: MembershipStatus.ACTIVE },
        orderBy: { createdAt: 'asc' },
      });
      if (!membership) return null;

      await tx.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });

      return { user, membership };
    });

    if (!data) {
      // Uniform error — never reveal which factor failed.
      throw new UnauthorizedException('Invalid email or password');
    }

    return this.issueTokens({
      userId: data.user.id,
      tenantId: data.membership.tenantId,
      roleId: data.membership.roleId,
      email,
    });
  }

  /**
   * Rotate a refresh token. Verifies the JWT signature, matches it against the
   * stored Session hash, revokes the old session, and issues a fresh pair. A
   * replayed (already-rotated) token fails the hash check and is rejected.
   */
  async refresh(refreshToken: string): Promise<TokenPair> {
    let payload: RefreshTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<RefreshTokenPayload>(refreshToken, {
        secret: this.refreshSecret,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const data = await this.prisma.asSystem(async (tx) => {
      const session = await tx.session.findUnique({
        where: { id: payload.sid },
      });
      if (
        !session ||
        session.revokedAt ||
        session.userId !== payload.sub ||
        session.expiresAt.getTime() < Date.now()
      ) {
        return null;
      }

      const matches = await argon2.verify(session.refreshTokenHash, refreshToken);
      if (!matches) return null;

      // Revoke the consumed session (rotation).
      await tx.session.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });

      const membership = await tx.membership.findUnique({
        where: {
          tenantId_userId: { tenantId: payload.tid, userId: payload.sub },
        },
      });
      if (!membership || membership.status !== MembershipStatus.ACTIVE) {
        return null;
      }
      return { membership };
    });

    if (!data) {
      throw new UnauthorizedException('Refresh token is no longer valid');
    }

    return this.issueTokens({
      userId: payload.sub,
      tenantId: data.membership.tenantId,
      roleId: data.membership.roleId,
      email: '', // refreshed access token re-resolves email in JwtStrategy
    });
  }

  /** Revoke the session backing a refresh token (idempotent best-effort). */
  async logout(refreshToken: string): Promise<{ success: boolean }> {
    try {
      const payload = await this.jwt.verifyAsync<RefreshTokenPayload>(
        refreshToken,
        { secret: this.refreshSecret },
      );
      await this.prisma.asSystem(async (tx) => {
        await tx.session.updateMany({
          where: { id: payload.sid, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      });
    } catch {
      // Already invalid — treat logout as successful.
    }
    return { success: true };
  }

  /**
   * Sign an access (15m) + refresh (30d) JWT pair. The refresh token is bound to
   * a freshly-created Session row (hash stored) so it can be rotated/revoked.
   */
  private async issueTokens(principal: {
    userId: string;
    tenantId: string;
    roleId: string;
    email: string;
  }): Promise<TokenPair> {
    // Create the session first so its id can be embedded in the refresh token.
    const session = await this.prisma.asSystem((tx) =>
      tx.session.create({
        data: {
          userId: principal.userId,
          refreshTokenHash: 'pending', // replaced below once token is signed
          expiresAt: new Date(Date.now() + this.ttlToMs(this.refreshTtl)),
        },
      }),
    );

    const accessPayload: AccessTokenPayload = {
      sub: principal.userId,
      tid: principal.tenantId,
      rid: principal.roleId,
      email: principal.email,
    };
    const refreshPayload: RefreshTokenPayload = {
      sub: principal.userId,
      tid: principal.tenantId,
      sid: session.id,
    };

    const accessToken = await this.jwt.signAsync(accessPayload, {
      privateKey: this.accessPrivateKey,
      algorithm: 'RS256',
      // `expiresIn` is typed against the `ms` StringValue template; our TTLs are
      // validated env strings (e.g. "15m") so we assert the compatible type.
      expiresIn: this.accessTtl as unknown as number,
    });
    const refreshToken = await this.jwt.signAsync(refreshPayload, {
      secret: this.refreshSecret,
      expiresIn: this.refreshTtl as unknown as number,
    });

    const refreshTokenHash = await argon2.hash(refreshToken);
    await this.prisma.asSystem((tx) =>
      tx.session.update({
        where: { id: session.id },
        data: { refreshTokenHash },
      }),
    );

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.accessTtl,
    };
  }

  /** Resolve the full principal for `GET /auth/me`. */
  async me(user: AuthenticatedUser): Promise<{
    userId: string;
    tenantId: string;
    email: string;
    roleId: string;
    roleType: string;
    permissions: string[];
  }> {
    return {
      userId: user.userId,
      tenantId: user.tenantId,
      email: user.email,
      roleId: user.roleId,
      roleType: user.roleType,
      permissions: user.permissions,
    };
  }

  private normaliseSlug(input: string): string {
    const slug = input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 63);
    return slug.length >= 3 ? slug : `t-${slug}`.padEnd(3, '0');
  }

  /** Convert a TTL string (`15m`, `30d`, `12h`, `45s`, or raw seconds) to ms. */
  private ttlToMs(ttl: string): number {
    const match = /^(\d+)([smhd])?$/.exec(ttl.trim());
    if (!match) return 30 * 24 * 60 * 60 * 1000; // default 30d
    const value = Number(match[1]);
    const unit = match[2] ?? 's';
    const factor =
      unit === 'd'
        ? 86_400_000
        : unit === 'h'
          ? 3_600_000
          : unit === 'm'
            ? 60_000
            : 1_000;
    return value * factor;
  }
}
