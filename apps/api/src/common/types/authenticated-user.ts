/**
 * The principal attached to `request.user` by the passport-jwt strategy after a
 * successful access-token validation. Shared by the guards and the
 * `@CurrentUser()` / `@CurrentTenant()` parameter decorators.
 */
export interface AuthenticatedUser {
  userId: string;
  tenantId: string;
  email: string;
  roleId: string;
  roleType: string;
  /** Flattened "resource:action" grants resolved from the active Role. */
  permissions: string[];
}
