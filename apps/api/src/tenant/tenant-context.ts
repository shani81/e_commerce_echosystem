import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Per-request ambient context.
 *
 * IMPORTANT: holding a `tenantId` here does NOT itself scope database access.
 * The ALS store is a convenience for logging/auditing and for code that needs
 * the active tenant without threading it through every signature. The database
 * tenant guard is enforced ONLY by `PrismaService.forTenant(tenantId, ...)`
 * (which sets the `app.current_tenant` GUC that RLS reads). Always pass the
 * tenantId into `forTenant` explicitly — never assume the store alone is enough.
 */
export interface TenantStore {
  tenantId?: string;
  userId?: string;
  /** Active membership/role ids, useful for guards & audit logs. */
  roleId?: string;
}

const als = new AsyncLocalStorage<TenantStore>();

/** Run `fn` with the given context bound to the async execution scope. */
export function run<T>(store: TenantStore, fn: () => T): T {
  return als.run(store, fn);
}

/** The active context for the current async scope, if any. */
export function getStore(): TenantStore | undefined {
  return als.getStore();
}

/** The active tenant id for the current async scope, if any. */
export function getTenantId(): string | undefined {
  return als.getStore()?.tenantId;
}

/** The active user id for the current async scope, if any. */
export function getUserId(): string | undefined {
  return als.getStore()?.userId;
}

export { als as tenantAls };
