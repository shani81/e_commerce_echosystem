import { RoleType } from '@aicos/db';

/**
 * Canonical permission catalogue ("resource:action"). Kept small for Phase 0 —
 * IAM + billing only. The guard also understands `resource:*` and `*` wildcards.
 */
export const PERMISSIONS = {
  USER_READ: 'user:read',
  USER_WRITE: 'user:write',
  ROLE_READ: 'role:read',
  ROLE_WRITE: 'role:write',
  BILLING_READ: 'billing:read',
  BILLING_WRITE: 'billing:write',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/**
 * Default permission grants per built-in tenant role. STORE_OWNER holds the
 * global wildcard (full control of their tenant); the rest are scoped.
 *
 * These are the values written to `Role.permissions` (a Json string[]) when a
 * tenant is provisioned during signup, and resolved by the RBAC guard at request
 * time.
 */
export const ROLE_PERMISSIONS: Record<string, string[]> = {
  [RoleType.STORE_OWNER]: ['*'],
  [RoleType.STORE_MANAGER]: [
    PERMISSIONS.USER_READ,
    PERMISSIONS.USER_WRITE,
    PERMISSIONS.ROLE_READ,
    PERMISSIONS.BILLING_READ,
  ],
  [RoleType.STORE_STAFF]: [PERMISSIONS.USER_READ],
};

/** Human-friendly default names for the seeded tenant roles. */
export const ROLE_DEFINITIONS: ReadonlyArray<{
  type: RoleType;
  name: string;
  description: string;
}> = [
  {
    type: RoleType.STORE_OWNER,
    name: 'Owner',
    description: 'Full control of the tenant, billing and team.',
  },
  {
    type: RoleType.STORE_MANAGER,
    name: 'Manager',
    description: 'Manages catalog, orders and team members.',
  },
  {
    type: RoleType.STORE_STAFF,
    name: 'Staff',
    description: 'Day-to-day operational access.',
  },
];
