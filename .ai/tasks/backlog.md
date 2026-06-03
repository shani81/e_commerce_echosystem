# AICOS — Task Backlog (Phase 0 + early Phase 1)

> Planned work, prioritized. All items below are **status = Planned** (we are in PHASE 0; implementation gated on plan approval).
> Priority: **P0** = must-have for the phase / blocker · **P1** = important · **P2** = nice-to-have.
> ID scheme: `T-<phase>-<module>-<n>`. Dependencies reference other task IDs.
> Last updated: 2026-06-03.

Legend — Status: `Planned` (not started) · `In Progress` · `Blocked` · `Done`. (Active/done items live in `in-progress.md` / `completed.md`.)

---

## Phase 0 — Foundation

### Monorepo & tooling
| ID | Description | Priority | Dependencies | Status |
|----|-------------|----------|--------------|--------|
| T-P0-REPO-01 | Scaffold pnpm monorepo: `apps/{web,admin,api,worker}`, `packages/{ui,config,types,ai-core,shared}`, `docker/`, `prisma/`, `.ai/` | P0 | — | Planned |
| T-P0-REPO-02 | Shared TS config, ESLint, Prettier in `packages/config`; strict mode on | P0 | T-P0-REPO-01 | Planned |
| T-P0-REPO-03 | `packages/types` + `packages/shared` (DTOs, result/error types, tenant context type) | P0 | T-P0-REPO-01 | Planned |
| T-P0-REPO-04 | Root scripts: `pnpm dev` brings up api/worker/web/admin against dockerized infra | P0 | T-P0-REPO-01 | Planned |

### Infrastructure (Docker, locked ports)
| ID | Description | Priority | Dependencies | Status |
|----|-------------|----------|--------------|--------|
| T-P0-INFRA-01 | Docker Compose: Postgres **16.9+** (5440), Redis (6400), Meilisearch (7700), MinIO (9200/9300), Mailhog (8100/1200) — infra only | P0 | — | Planned |
| T-P0-INFRA-02 | `.env.example` aligned to locked ports; Doppler wired for dev secrets | P0 | T-P0-INFRA-01 | Planned |
| T-P0-INFRA-03 | PgBouncer in **transaction pooling** mode in front of Postgres | P0 | T-P0-INFRA-01 | Planned |
| T-P0-INFRA-04 | MinIO buckets + `temp/` prefix with **48h lifecycle** rule; pre-signed URL helper | P1 | T-P0-INFRA-01 | Planned |

### Database & multi-tenancy
| ID | Description | Priority | Dependencies | Status |
|----|-------------|----------|--------------|--------|
| T-P0-DB-01 | Prisma schema v0; every tenant model has `tenantId` + `@@index([tenantId])` + `@@index([tenantId, createdAt])` | P0 | T-P0-REPO-01, T-P0-INFRA-01 | Planned |
| T-P0-DB-02 | RLS policies on every tenant table + **FORCE ROW LEVEL SECURITY** | P0 | T-P0-DB-01 | Planned |
| T-P0-DB-03 | `withTenant` data-access wrapper: `set_config(..., TRUE)` inside Prisma `$transaction`; sole sanctioned DB path | P0 | T-P0-DB-02 | Planned |
| T-P0-DB-04 | All views created with `security_invoker = true`; CI lint fails any view missing it | P0 | T-P0-DB-02 | Planned |
| T-P0-DB-05 | Migrations run as a **pre-deploy job**, never in NestJS startup | P0 | T-P0-DB-01 | Planned |
| T-P0-DB-06 | Automated **cross-tenant isolation test** (tenant A cannot read tenant B) in CI | P0 | T-P0-DB-03 | Planned |

### IAM (auth, RBAC, tenant context)
| ID | Description | Priority | Dependencies | Status |
|----|-------------|----------|--------------|--------|
| T-P0-IAM-01 | Signup/login; JWT **RS256** (access in memory, refresh in httpOnly cookie); bcrypt cost 12 | P0 | T-P0-DB-03 | Planned |
| T-P0-IAM-02 | Organization/tenant creation on signup; tenant ↔ user membership | P0 | T-P0-IAM-01 | Planned |
| T-P0-IAM-03 | RBAC roles for 6 personas (Store Owner, Manager, Staff, End Customer, Platform Super Admin, Agency/White-label Reseller); NestJS guards | P0 | T-P0-IAM-02 | Planned |
| T-P0-IAM-04 | `TenantContextMiddleware`: set Postgres session var + AsyncLocalStorage | P0 | T-P0-DB-03 | Planned |
| T-P0-IAM-05 | Team invites + member management | P1 | T-P0-IAM-03 | Planned |
| T-P0-IAM-06 | JWT key rotation (90-day) with previous public key valid during rotation window | P1 | T-P0-IAM-01 | Planned |

### Billing skeleton (platform SaaS)
| ID | Description | Priority | Dependencies | Status |
|----|-------------|----------|--------------|--------|
| T-P0-BILL-01 | Stripe Billing products/prices for Starter/Growth/Pro/Enterprise (test mode) | P0 | T-P0-IAM-02 | Planned |
| T-P0-BILL-02 | Subscription create/update; tenant subscription state model | P0 | T-P0-BILL-01 | Planned |
| T-P0-BILL-03 | Stripe webhook ingestion via **BullMQ** (raw-body route at bootstrap; timestamp window + event-ID dedupe) | P0 | T-P0-BILL-02 | Planned |
| T-P0-BILL-04 | **Metered-usage plumbing provisioned but disabled** (meter events scaffold for P2 AI credits) | P1 | T-P0-BILL-02 | Planned |

### Design system & app shells
| ID | Description | Priority | Dependencies | Status |
|----|-------------|----------|--------------|--------|
| T-P0-UI-01 | `packages/ui` on shadcn/ui + Tailwind + Framer Motion tokens; base components | P0 | T-P0-REPO-02 | Planned |
| T-P0-UI-02 | `apps/web` (3000) + `apps/admin` (3100) shells with auth-gated layouts | P1 | T-P0-UI-01, T-P0-IAM-03 | Planned |

### CI/CD, observability, secrets
| ID | Description | Priority | Dependencies | Status |
|----|-------------|----------|--------------|--------|
| T-P0-CI-01 | GitHub Actions: lint, typecheck, unit tests, Prisma migrate check, build; green on main | P0 | T-P0-REPO-02 | Planned |
| T-P0-CI-02 | trufflehog pre-commit + CI secret scan | P0 | T-P0-REPO-01 | Planned |
| T-P0-OBS-01 | Structured logging (pino) + request/tenant correlation IDs | P1 | T-P0-IAM-04 | Planned |
| T-P0-OBS-02 | OpenTelemetry traces (api + worker) + health/readiness endpoints | P1 | T-P0-REPO-04 | Planned |
| T-P0-OBS-03 | Error tracking (Sentry-style) wired in api + worker | P2 | T-P0-OBS-01 | Planned |
| T-P0-WORK-01 | `apps/worker` as separate NestJS app consuming BullMQ; queue dashboard on 4100 | P0 | T-P0-INFRA-01 | Planned |
| T-P0-DOC-01 | Keep `project-dashboard.html` current (URLs, admin/super-admin creds for local, milestone markers, last-updated timestamp) | P1 | — | Planned |

---

## Early Phase 1 — Core Commerce MVP (first slice)

| ID | Description | Priority | Dependencies | Status |
|----|-------------|----------|--------------|--------|
| T-P1-CAT-01 | `catalog`: product/variant/category/brand/attribute models (designed so AI extraction writes the same entities) | P0 | T-P0-DB-03 | Planned |
| T-P1-CAT-02 | Admin product/variant CRUD UI | P0 | T-P1-CAT-01, T-P0-UI-02 | Planned |
| T-P1-MEDIA-01 | `media`: pre-signed upload to MinIO/R2, multipart for large files, image variants/CDN | P0 | T-P0-INFRA-04 | Planned |
| T-P1-INV-01 | `inventory`: stock per variant/location, adjustments, low-stock thresholds | P0 | T-P1-CAT-01 | Planned |
| T-P1-SEARCH-01 | `search`: Meilisearch index per tenant; **tenant tokens** (1h TTL); storefront queries Meilisearch directly (no master key on frontend) | P0 | T-P1-CAT-01 | Planned |
| T-P1-STORE-01 | `storefront`: product listing/detail + cart (Next.js, SEO-ready) | P0 | T-P1-CAT-01, T-P1-SEARCH-01 | Planned |
| T-P1-PAY-01 | `payments`: Stripe **Checkout embedded** + **Connect Accounts v2** (Stripe-managed, destination charges); `automatic_tax` on; pinned API version | P0 | T-P0-BILL-03, T-P1-STORE-01 | Planned |
| T-P1-ORD-01 | `orders`: order created on payment; draft/pending/paid; schema supports **split payments** | P0 | T-P1-PAY-01 | Planned |
| T-P1-PAY-02 | Refunds incl. partial (`reverse_transfer`, application-fee handling) + dispute-evidence scaffold | P1 | T-P1-PAY-01 | Planned |
| T-P1-SHIP-01 | `shipping`: `ShippingProvider` interface + **Shippo** default (Bring/PostNord); labels/rates/tracking; `ShipmentRecord` persisted with cached label URLs | P0 | T-P1-ORD-01 | Planned |
| T-P1-CUST-01 | `customers`: records + **customer portal** (order tracking, invoices, returns request) | P1 | T-P1-ORD-01 | Planned |
| T-P1-NOTIF-01 | `notifications`: transactional email (Mailhog dev / SendGrid prod) for order/shipping events | P1 | T-P1-ORD-01 | Planned |
| T-P1-ADMIN-01 | `admin`: dashboard tiles (revenue/orders/customers/inventory) | P1 | T-P1-ORD-01 | Planned |
| T-P1-GDPR-01 | DSAR export + erasure endpoints + nightly BullMQ retention job + DPA template (before any EU customer) | P0 | T-P0-DB-03 | Planned |
| T-P1-MIG-01 | WooCommerce/CSV catalog importer (migration on-ramp) | P2 | T-P1-CAT-01 | Planned |

---

## Notes
- Every DB-touching task must route through `withTenant` (T-P0-DB-03) — no exceptions.
- Every future `ai-core` call (P2) must emit `ai.usage` events; the metered plumbing (T-P0-BILL-04) is staged in P0 to make that possible.
- The human-verification publish gate is introduced in P2 and is **not** in this backlog because no AI auto-creation exists yet in P0/P1.
