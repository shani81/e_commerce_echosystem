import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PERMISSIONS_KEY } from '../decorators/roles.decorator';
import type { AuthenticatedUser } from '../types/authenticated-user';

/**
 * RBAC guard. Reads the `@Permissions(...)` metadata for the handler/class and
 * checks the authenticated user's resolved permission set.
 *
 * A user satisfies the requirement when, for EVERY required grant, their set
 * contains either the exact grant, the resource wildcard (`resource:*`), or the
 * global wildcard (`*`) — the last is granted to STORE_OWNER /
 * PLATFORM_SUPER_ADMIN seeded roles.
 *
 * Must run AFTER {@link JwtAuthGuard} so `request.user` is populated.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[] | undefined>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No @Permissions on the route — authentication alone is sufficient.
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as AuthenticatedUser | undefined;
    if (!user) {
      throw new ForbiddenException('Missing authenticated principal');
    }

    const granted = new Set(user.permissions ?? []);
    const hasAll = required.every((perm) => this.isGranted(perm, granted));
    if (!hasAll) {
      throw new ForbiddenException(
        `Insufficient permissions: requires ${required.join(', ')}`,
      );
    }
    return true;
  }

  private isGranted(required: string, granted: Set<string>): boolean {
    if (granted.has('*')) return true;
    if (granted.has(required)) return true;
    const [resource] = required.split(':');
    return granted.has(`${resource}:*`);
  }
}
