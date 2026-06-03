# AICOS Multi-Tenant Model

> **Decision (D-006):** Multi-tenancy = **shared database + shared schema + `tenant_id` on every row + PostgreSQL Row-Level Security (RLS)**.
> Schema-per-tenant is **reserved** for a small number of large/enterprise tenants later; it is NOT the default.
> This document is authoritative for tenant hierarchy, isolation rules, data ownership, and the access model.

---

## 1. Why shared-schema + RLS (decisive rationale)

AICOS must scale to **tens of thousands → millions** of store-owner tenants (the TAM is the 78% of retail still offline). The research is unambiguous:

| Strategy | Latency @100k tenants | Migration cost | Isolation strength | Verdict |
|---|---|---|---|---|
| **Shared schema + `tenant_id` + RLS** | **3.6 ms** (vs 3.2 ms no-RLS → +0.4 ms) | One Prisma migration for all | **DB-enforced**, survives app bugs | **CHOSEN** |
| Schema-per-tenant | 4.8–12.5 ms | Migration × N schemas | Strong, but operationally heavy | Reserved for enterprise tenants only |
| Database-per-tenant | Highest | Worst (N databases) | Strongest | Not used |

RLS gives a **hard, database-level isolation guarantee that survives application-layer bugs** for only ~0.4 ms overhead. It scales to 100k+ tenants with a single migration. That combination is unbeatable for AICOS's scale and team size.

---

## 2. Tenant hierarchy & object model

```
Platform (AICOS — super admin scope)
│
├── Reseller / Agency (white-label, P5)         ← optional parent of many tenants
│      │
│      └── Tenant (a Store Owner's account)  ◄── the unit of isolation; tenant_id everywhere
│             │
│             ├── Membership ── User ── Role            (Owner / Manager / Staff)
│             ├── Store(s) / StoreSettings              (a tenant may run >1 storefront later)
│             ├── Catalog · Inventory · Orders · …      (all tenant-scoped commerce data)
│             ├── OAuthConnection (Google, per tenant)
│             ├── ConnectAccount (Stripe, per tenant)
│             └── End Customers (shoppers of THAT store) ◄── isolated from other tenants' customers
│
└── Platform-global tables (NOT tenant-scoped): Plan, AiProviderConfig(defaults), system Role templates
```

### Tenant vs. Store
- **Tenant** = the account/billing/isolation boundary (one store owner = one tenant in P1).
- **Store** = a storefront surface owned by a tenant. P1 = 1 store per tenant; the data model supports many for future multi-brand/multi-location. `tenant_id` is the isolation key; `store_id` is a sub-scope **within** a tenant.

### Personas mapped to scopes
| Persona | Scope | Typical role |
|---|---|---|
| Store Owner (primary, non-technical) | one Tenant | `OWNER` |
| Store Manager | one Tenant | `MANAGER` |
| Store Staff | one Tenant | `STAFF` |
| End Customer (shopper) | one Tenant's storefront | `CUSTOMER` (separate customer identity, not a platform User) |
| Platform Super Admin | Platform | `SUPER_ADMIN` (RLS bypass via explicit, audited service role) |
| Agency / White-label Reseller | many Tenants (children) | `RESELLER` (P5) |

> **End customers are NOT platform Users.** Shoppers live in the tenant-scoped `Customer` table with their own auth context. This prevents a shopper of Store A from ever appearing in Store B and keeps the IAM trust root clean.

---

## 3. Isolation rules (non-negotiable engineering contract)

These are the rules that make RLS actually safe. Each maps to a concrete failure the research flagged as **Critical**.

1. **Every tenant table has `tenant_id NOT NULL`** and an RLS policy:
   ```sql
   ALTER TABLE "<table>" ENABLE ROW LEVEL SECURITY;
   ALTER TABLE "<table>" FORCE ROW LEVEL SECURITY;            -- owner/migration role must NOT bypass
   CREATE POLICY tenant_isolation ON "<table>"
     USING (tenant_id = current_setting('app.current_tenant')::uuid)
     WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);
   ```
   `FORCE ROW LEVEL SECURITY` is mandatory — without it the table-owner (migration) role silently bypasses all policies.

2. **Tenant context is set transaction-locally, never session-globally.**
   With Prisma + PgBouncer in **transaction pooling** mode, use `SET LOCAL` / `set_config(..., TRUE)` **inside a `$transaction`**:
   ```ts
   await prisma.$transaction(async (tx) => {
     await tx.$executeRaw`SELECT set_config('app.current_tenant', ${tenantId}, TRUE)`; // TRUE = txn-local
     // ... tenant-scoped queries
   });
   ```
   Using session scope (`FALSE`) or `SET SESSION`, or setting it outside a transaction, **leaks tenant context across pooled connections** → cross-tenant data exposure. This is the single highest-priority correctness rule on the platform.

3. **PgBouncer runs in transaction pooling mode.** Session mode + `SET SESSION` is a banned configuration.

4. **All views set `security_invoker = true`:**
   ```sql
   ALTER VIEW "<view>" SET (security_invoker = true);
   ```
   A superuser/migration-owned view without this silently bypasses RLS for everything it exposes.

5. **The `withTenant` wrapper is the only sanctioned DB entry path.** Every NestJS service DB call goes through it; it sets the Postgres session var **and** populates `AsyncLocalStorage` so non-DB code (logging, AI usage events, S3 keys) can read `tenantId` without threading it through params. Direct Prisma access bypassing the wrapper is forbidden by lint/review.

6. **Super-admin / platform jobs use an explicit, audited service role** that may bypass RLS only for clearly-scoped maintenance (migrations, billing reconciliation, support). Every such access is written to an append-only audit log.

7. **PostgreSQL pinned to 16.9+** (CVE-2024-10978, CVE-2025-8713 — optimizer-statistics RLS leak fixed in 16.9+/17.5+).

8. **Per-tenant external identities are isolated:** Stripe `ConnectAccount`, Google `OAuthConnection` (with encrypted `refreshToken`/`accessToken`, `granted_scopes[]`), Meilisearch tenant tokens (1h TTL, `tenant_id` filter embedded). The Meili **master key is never sent to the frontend** — only tenant tokens.

9. **Composite indexing for RLS-active queries:** every tenant model carries `@@index([tenantId])` and `@@index([tenantId, createdAt])` to avoid full scans on paginated tenant queries.

---

## 4. Data ownership & residency

| Data class | Controller/Processor (GDPR) | Owner module | Residency rule |
|---|---|---|---|
| Tenant account + users | AICOS is **controller** | `iam` | EU tenants → EU region (eu-west-1/eu-central-1 or R2 EU jurisdiction lock) from day one |
| End-customer (shopper) PII | AICOS is **processor**, tenant is controller | `customers` | Follows the tenant's region; DPA signed with every tenant |
| Catalog / media | Tenant owns | `catalog`/`media` | R2 EU/US jurisdiction-locked buckets |
| Payment data | Stripe (PCI Level 1) holds card data; AICOS stays **SAQ A** | `payments` | Never stored in AICOS DB |
| AI extraction inputs (video/frames) | Tenant owns; transient | `ai-extraction`/`media` | `temp/` prefix, 48h lifecycle expiry |
| AI provider transfers | Cross-border to US (Anthropic/OpenAI/Google) | `ai-core` | **SCCs + Transfer Impact Assessment** per provider (Schrems II) |

**GDPR dual role is explicit:** AICOS is *controller* of tenant accounts and *processor* of end-customer data. DSAR endpoints (export + erasure) ship in **P1** before EU customers are accepted; a BullMQ nightly retention-enforcement job runs in the worker service.

---

## 5. Access model (authn + authz)

```
Request ─► [JWT verify RS256] ─► [TenantContextMiddleware]
                                     ├─ resolve tenant_id from token/subdomain
                                     ├─ open $transaction + set_config('app.current_tenant', id, TRUE)
                                     └─ AsyncLocalStorage.run({ tenantId, userId, roles })
                                          │
                                          ▼
                                   [RBAC Guard] ── role/permission check (OWNER>MANAGER>STAFF; CUSTOMER; SUPER_ADMIN)
                                          │
                                          ▼
                                   Controller ─► Service ─► withTenant(Prisma)  ─► RLS-enforced rows
```

- **Authentication:** JWT **RS256**, keys rotated every 90 days (previous public key kept active during a 15-min rotation window). Bcrypt cost factor 12. **Access tokens live in memory, never `localStorage`** (XSS exfiltration risk — including XSS via AI-generated content).
- **Authorization:** RBAC roles per tenant (`OWNER` > `MANAGER` > `STAFF`), plus the distinct `CUSTOMER` identity and platform `SUPER_ADMIN`. Permissions are checked in a NestJS guard **above** the data layer; RLS is the backstop **below** it. Defense in depth: even a broken guard cannot return another tenant's rows because RLS still filters.
- **Search access:** frontend uses a per-session Meilisearch **tenant token** (1h TTL) and queries Meili directly — the token's embedded `tenant_id` filter enforces isolation without the API in the hot path.

---

## 6. Tenant lifecycle
1. **Signup** → create `Tenant` + `Owner` `User` + default `Subscription` (Starter/free) + Stripe `ConnectAccount` (Accounts v2, hosted onboarding) + GA4 property (P4) + Meili index.
2. **Onboard** → record shelf video → extraction → review → publish (the north-star flow).
3. **Operate** → commerce + AI agents within entitlements/quotas (billing-enforced).
4. **Upgrade/Downgrade** → plan change adjusts entitlements + AI credit allotment.
5. **Offboard / DSAR-erase** → export bundle, then cascade-delete tenant-scoped rows (RLS-safe), revoke OAuth/Connect, purge media (incl. label cache), retain only legally-required financial records.

---

## 7. Escalation path (when shared-schema isn't enough)
A tenant is migrated to **schema-per-tenant** (or dedicated DB) only when it meets enterprise triggers: very large catalog/order volume, contractual data-isolation requirements, or regulated-industry residency. The application code is written so the tenant-resolution layer can point a tenant at a different schema/connection **without changing domain logic** — `withTenant` is the seam. This keeps the door open without paying schema-per-tenant cost for the 99%.

---

## 8. Quick-reference: the 9 rules that prevent cross-tenant leaks
1. `tenant_id NOT NULL` on every tenant table · 2. `FORCE ROW LEVEL SECURITY` · 3. `set_config(..., TRUE)` inside `$transaction` · 4. PgBouncer transaction pooling · 5. `security_invoker=true` on all views · 6. only `withTenant` touches the DB · 7. audited service role for super-admin bypass · 8. Postgres ≥ 16.9 · 9. composite `[tenantId]`/`[tenantId, createdAt]` indexes.
