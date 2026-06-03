import {
  createParamDecorator,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../types/authenticated-user';

/**
 * Injects the active tenant id for the request — sourced from the authenticated
 * principal (`request.user.tenantId`). Returns undefined on unauthenticated
 * routes; pair with `JwtAuthGuard` when a tenant is required.
 *
 * Reminder: this id must be passed into `PrismaService.forTenant(id, fn)` to
 * actually scope DB access — having it in hand does not enforce RLS by itself.
 */
export const CurrentTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const user = request.user as AuthenticatedUser | undefined;
    return user?.tenantId;
  },
);
