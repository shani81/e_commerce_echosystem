import { Injectable, Logger, type NestMiddleware } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import { run, type TenantStore } from './tenant-context';

/**
 * Shape of our signed access-token payload (see AuthService.issueTokens).
 */
interface AccessTokenClaims {
  sub: string; // userId
  tid: string; // tenantId
  rid?: string; // active roleId
}

/**
 * Populates the per-request {@link TenantStore} (AsyncLocalStorage) and runs the
 * rest of the pipeline inside it.
 *
 * Resolution order:
 *   1. A verified `Authorization: Bearer <accessToken>` — the trusted source for
 *      browser/user traffic. We verify the RS256 signature with the JWT public
 *      key (algorithm pinned); an invalid/expired token is simply ignored here
 *      (route guards, not this middleware, decide 401s) so public routes keep
 *      working.
 *   2. `X-Tenant-Id` header — only honoured for internal service-to-service
 *      calls (the API gateway / worker callbacks). It does NOT bypass auth: an
 *      unauthenticated request that merely sets this header still has no userId
 *      and JwtAuthGuard will reject any protected route.
 *
 * NOTE: setting tenantId in the store does NOT scope the database. Every DB
 * access must still go through `PrismaService.forTenant(tenantId, fn)`.
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenantMiddleware.name);
  private readonly accessPublicKey: string;

  constructor(
    private readonly jwt: JwtService,
    config: ConfigService,
  ) {
    this.accessPublicKey = config.getOrThrow<string>('jwt.accessPublicKey');
  }

  use(req: Request, _res: Response, next: NextFunction): void {
    const store: TenantStore = {};

    const token = this.extractBearer(req);
    if (token) {
      try {
        const claims = this.jwt.verify<AccessTokenClaims>(token, {
          publicKey: this.accessPublicKey,
          algorithms: ['RS256'],
        });
        store.userId = claims.sub;
        store.tenantId = claims.tid;
        store.roleId = claims.rid;
      } catch {
        // Invalid/expired token — leave the store empty; guards enforce auth.
      }
    }

    if (!store.tenantId) {
      const headerTenant = req.headers['x-tenant-id'];
      if (typeof headerTenant === 'string' && headerTenant.length > 0) {
        store.tenantId = headerTenant;
      }
    }

    run(store, () => next());
  }

  private extractBearer(req: Request): string | undefined {
    const header = req.headers.authorization;
    if (!header) return undefined;
    const [scheme, value] = header.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !value) return undefined;
    return value;
  }
}
