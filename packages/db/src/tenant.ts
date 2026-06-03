import type { Prisma, PrismaClient } from '@prisma/client';

/** Transaction-local Postgres GUCs that the RLS policies read. */
export const TENANT_GUC = 'app.current_tenant';
export const BYPASS_GUC = 'app.bypass_rls';

export interface TxOptions {
  /** Max time the interactive transaction may run (ms). */
  timeout?: number;
  /** Max time to wait for a connection from the pool (ms). */
  maxWait?: number;
}

const DEFAULTS: Required<TxOptions> = { timeout: 15_000, maxWait: 5_000 };

/**
 * Run `fn` inside a transaction scoped to `tenantId`, so PostgreSQL Row-Level
 * Security restricts every statement to that tenant's rows.
 *
 * The tenant id is set with `set_config(..., is_local = true)` — transaction
 * local, NEVER session scope — which is the only pattern that is safe under
 * PgBouncer transaction pooling (a pooled connection never leaks tenant context
 * to the next checkout). This is the ONLY sanctioned path for tenant-scoped DB
 * access; see .ai/master-brain/tenant-model.md.
 */
export async function withTenant<T>(
  prisma: PrismaClient,
  tenantId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  opts: TxOptions = {},
): Promise<T> {
  if (!tenantId) throw new Error('withTenant() requires a non-empty tenantId');
  const o = { ...DEFAULTS, ...opts };
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config(${TENANT_GUC}, ${tenantId}, true)`;
      return fn(tx);
    },
    { timeout: o.timeout, maxWait: o.maxWait },
  );
}

/**
 * Run `fn` with RLS bypassed, for TRUSTED platform/admin operations that must
 * span tenants: authentication lookups (which tenants a user belongs to),
 * Stripe/webhook processing, super-admin tooling, background jobs, and seeding.
 *
 * SECURITY: never pass user-controlled scope into the work done here — bypassing
 * RLS removes the database-level tenant guard. Keep these call sites few and
 * auditable. Prefer `withTenant()` everywhere else.
 */
export async function withSystem<T>(
  prisma: PrismaClient,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  opts: TxOptions = {},
): Promise<T> {
  const o = { ...DEFAULTS, ...opts };
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config(${BYPASS_GUC}, 'on', true)`;
      return fn(tx);
    },
    { timeout: o.timeout, maxWait: o.maxWait },
  );
}
