# @aicos/db

The single source of the AICOS database layer: the Prisma schema, the generated client, and the **multi-tenant Row-Level Security (RLS) helpers**. Every other workspace imports the client and tenant helpers from here — never `@prisma/client` directly.

## Multi-tenancy model
Shared database · shared schema · `tenantId` on every tenant-scoped row · **PostgreSQL RLS with `FORCE`**. See [tenant-model](../../.ai/master-brain/tenant-model.md).

```ts
import { withTenant, withSystem, createPrismaClient } from '@aicos/db';

// Tenant-scoped access (the default, RLS-enforced):
await withTenant(prisma, tenantId, (tx) => tx.product.findMany());

// Trusted cross-tenant platform access (auth, billing webhooks, seeding):
await withSystem(prisma, (tx) => tx.user.findUnique({ where: { email } }));
```

- `withTenant` sets the transaction-local GUC `app.current_tenant` (never session scope → safe under PgBouncer transaction pooling).
- `withSystem` sets `app.bypass_rls = on`; use sparingly and only in audited platform code.
- A query with neither GUC set sees **nothing** (deny-by-default).

## Commands (run from repo root)
| Command | Action |
|--------|--------|
| `pnpm db:generate` | Generate the Prisma client |
| `pnpm db:push` | Push schema to the DB (no migration history) |
| `pnpm db:rls` | Apply `prisma/sql/enable-rls.sql` to all tenant tables (idempotent) |
| `pnpm db:seed` | Seed plans, super admin, demo tenant |
| `pnpm db:setup` | generate → push → rls → seed (first-time bootstrap) |
| `pnpm db:studio` | Open Prisma Studio |

> RLS is applied by a SQL script (Prisma does not manage policies). Re-run `pnpm db:rls` after every `db:push` / `migrate`.

Requires PostgreSQL **≥ 16.9** with the `vector`, `pgcrypto`, `pg_trgm`, `citext` extensions — provided by the `pgvector/pgvector:pg16` image in `docker/docker-compose.yml`.
