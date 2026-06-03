// Authentication & authorization primitives shared by the API, workers and
// admin/web clients. The values here mirror the `RoleType` enum in the Prisma
// schema (packages/db) — keep them in sync.

/**
 * AICOS personas. These map 1:1 to the platform `RoleType` values:
 *   - PLATFORM_SUPER_ADMIN / AGENCY_RESELLER are platform-scoped.
 *   - STORE_OWNER / STORE_MANAGER / STORE_STAFF are tenant-scoped.
 *   - END_CUSTOMER is the storefront shopper (modelled as `Customer`, not `User`).
 */
export enum Persona {
  STORE_OWNER = 'STORE_OWNER',
  STORE_MANAGER = 'STORE_MANAGER',
  STORE_STAFF = 'STORE_STAFF',
  END_CUSTOMER = 'END_CUSTOMER',
  PLATFORM_SUPER_ADMIN = 'PLATFORM_SUPER_ADMIN',
  AGENCY_RESELLER = 'AGENCY_RESELLER',
}

/**
 * Decoded JWT access-token claims.
 *   - `sub`  : the platform User id (subject).
 *   - `tid`  : the active tenant id for this request (absent for platform-only tokens).
 *   - `roles`: the persona/role grants for the active context.
 */
export interface JwtPayload {
  /** Subject — the User id. */
  sub: string;
  /** Active tenant id (omitted for platform-super-admin tokens with no tenant). */
  tid?: string;
  /** Persona/role grants effective for this token. */
  roles: Persona[];
  /** Issued-at (epoch seconds), set by the signer. */
  iat?: number;
  /** Expiry (epoch seconds), set by the signer. */
  exp?: number;
  /** Token issuer. */
  iss?: string;
  /** Token audience. */
  aud?: string;
}

/** A freshly minted access + refresh token pair. */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  /** Access-token lifetime in seconds. */
  expiresIn: number;
  /** Token type — always "Bearer". */
  tokenType: 'Bearer';
}

/** The authenticated principal attached to a request after guard resolution. */
export interface AuthenticatedUser {
  userId: string;
  tenantId?: string;
  roles: Persona[];
  email?: string;
}
