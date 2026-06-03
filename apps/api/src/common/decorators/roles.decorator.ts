import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'requiredPermissions';

/**
 * Declares the "resource:action" grants a route requires. `RolesGuard` checks
 * these against the authenticated user's resolved permission set.
 *
 * @example
 *   @Permissions('user:read')
 *   @Get('users')
 *   listUsers() { ... }
 */
export const Permissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/** Alias kept for ergonomics; RBAC is permission-based under the hood. */
export const Roles = Permissions;
