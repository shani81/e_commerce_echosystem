# AICOS — Database Schema Design

**Status:** DRAFT (Phase 0 — Foundation planning). No migrations generated yet.
**Owner:** Database Architect
**Date:** 2026-06-03
**Engine:** PostgreSQL 16.9+ (RLS CVE fixes) · Prisma ORM 6.x · pgvector · citext · pg_trgm
**Source of truth:** `prisma/schema.prisma` (59 models). This document is the rationale & operations companion.

---

## 1. Goals & Constraints

AICOS is a multi-tenant commerce OS that must scale to **tens of thousands → millions** of store-owner tenants, run a **flagship AI video-to-catalog extraction pipeline**, and never auto-publish AI output (human verification gate). The data model is designed around these hard requirements:

| Requirement | Design response |
|---|---|
| Hard tenant isolation that survives app bugs | `tenant_id` on every tenant-scoped row + **PostgreSQL Row-Level Security (RLS)** with `FORCE ROW LEVEL SECURITY` |
| Scale to 100k+ tenants on one DB/migration | Shared database, shared schema (RLS overhead only ~0.4 ms vs no-RLS at 100k rows) |
| AI cost governance is revenue-protecting | `CreditBalance` + append-only `CreditTransaction` ledger; `AiUsageEvent` metering feeds billing |
| Nothing AI publishes automatically | `ExtractionReviewItem` human gate; `Product.status` starts `DRAFT`/`PENDING_REVIEW` |
| Money correctness | All money stored as **integer minor units (cents)**; never `Float` |
| GDPR dual-role + residency | `Tenant.dataRegion` (EU/US), `DsarRequest`, soft-delete + hard-erase worker |
| Provider-swappable AI | `AiProvider` enum + provider-agnostic `AiAgentRun`/`AiUsageEvent` |
| Cross-frame product dedup | `ProductEmbedding` (pgvector 512-dim) + `ExtractionResult.dedupGroupKey` |

---

## 2. Multi-Tenancy Approach

**Decision (D-006):** Shared database, shared schema, `tenant_id` on every tenant row, enforced by **PostgreSQL RLS**. Schema-per-tenant is reserved for large/enterprise tenants later (not built in P0).

### Why shared-schema + RLS
- **Cost/scale:** one Prisma migration covers all tenants; ~0.4 ms RLS penalty (3.2 ms → 3.6 ms at 100k rows / 1,000 tenants). Schema-per-tenant measures 4.8–12.5 ms at the same scale and explodes migration/connection management.
- **Defense in depth:** RLS is a *database-level* guarantee. Even if an application query forgets a `WHERE tenant_id = ?`, the database refuses to return other tenants' rows.

### Tenant context propagation
1. `TenantContextMiddleware` (NestJS) resolves the active tenant from the JWT/membership and validates it against the user's `Membership` rows.
2. The middleware sets **both**:
   - PostgreSQL session var via `SELECT set_config('app.current_tenant', $tenantId, TRUE)` — the `TRUE` (transaction-local) flag is mandatory.
   - `AsyncLocalStorage` so non-DB code can read `tenantId` without threading it through params.
3. Every service DB call runs through a `withTenant()` wrapper that opens a Prisma `$transaction`, calls `set_config(..., TRUE)`, then runs the query inside the same transaction.

### Connection-pool safety (critical)
- **PgBouncer MUST run in `transaction` pooling mode**, never `session`.
- Use `set_config('app.current_tenant', X, TRUE)` (**transaction-local**) — `TRUE`/`SET LOCAL`. A session-scoped variable (`FALSE`/`SET SESSION`) **leaks across pooled connections** and is a critical cross-tenant data-exposure bug.
- The Prisma `set_config` call must be **inside the `$transaction`** that runs the query. Setting it outside, or with session scope, silently breaks isolation for the next request that reuses the connection.

### Models that are NOT tenant-scoped
- `Tenant` (it *is* the tenant), `Plan` (global AICOS product catalog), platform-global `Role` rows (`tenantId = null`), `Session` (keyed to `User`), `User` (platform identity that may span tenants via `Membership`).
- `AuditLog.tenantId` is nullable to record platform-level events.

---

## 3. RLS Strategy (implementation contract)

RLS policies are **not** managed by Prisma; they are added as raw-SQL steps appended to each migration (kept in `prisma/migrations/_rls/*.sql` and applied by a pre-deploy K8s Job). The contract for **every tenant-scoped table**:

```sql
-- 1. Enable + FORCE (FORCE so the table owner / migration role cannot bypass)
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE products FORCE ROW LEVEL SECURITY;

-- 2. Isolation policy keyed on the transaction-local GUC
CREATE POLICY tenant_isolation ON products
  USING      (tenant_id = current_setting('app.current_tenant', true))
  WITH CHECK (tenant_id = current_setting('app.current_tenant', true));
```

Rules enforced in review/CI:
- **`FORCE ROW LEVEL SECURITY` on every tenant table.** Without it the table owner (the migration user) silently bypasses all policies.
- **Every VIEW** that touches tenant data must set `ALTER VIEW v SET (security_invoker = true)` — superuser-owned views bypass RLS otherwise.
- **No `SECURITY DEFINER` functions** over tenant tables unless they re-assert the tenant filter.
- PostgreSQL pinned to **16.9+** (CVE-2024-10978, CVE-2025-8713 — optimizer statistics could leak RLS-protected row values below 16.9).
- A CI guard (lint) fails the build if a model carries `tenantId` but its table lacks an RLS policy in `_rls/`.
- Meilisearch isolation is parallel: per-session **tenant tokens** (1-hour TTL, embedded `tenant_id = X` filter), never the master key on the frontend.

---

## 4. Key Entities & Relationships

### 4.1 Identity & tenancy (P0 — `iam`)
- **Tenant** ← root. Self-relation `agencyId` supports white-label/agency reseller hierarchy.
- **User** ↔ **Tenant** via **Membership** (carries **Role**). A user can be Owner of one tenant and Staff of another. `Session` holds rotated refresh tokens (access JWTs are RS256, memory-only client-side — never `localStorage`).
- **Role** is tenant-scoped *or* platform-global (`tenantId = null`) with a JSON `permissions` array of `resource:action` grants. `RoleType` maps to the six personas.
- **ApiKey** for programmatic/agency access (hashed, prefixed, scoped).

### 4.2 Billing (P0 — `billing`)
- **Plan** (global) → **Subscription** (per tenant, mirrors Stripe Billing) → **Invoice**.
- **CreditBalance** (one per tenant × `CreditType`) + append-only **CreditTransaction** ledger — the source of truth for AI cost governance. `AiUsageEvent` consumption writes here.
- Metered AI add-ons (extraction minutes, generation credits) are provisioned in P0 even though they switch on in P2.

### 4.3 Store + catalog (P1)
- **Store** (1+ per tenant) is the publishing container; links to a physical `Address` + geo for Google Business Profile / Maps.
- **Product** → **ProductVariant** (1+; inventory & price always live at the variant level). Single-variant products still get one default variant.
- **Category** (self-referential tree) ↔ Product via **ProductCategory** (M:N). **Brand** 1:N Product.
- **ProductImage** → **MediaAsset**. **ProductEmbedding** holds the pgvector(512) used for semantic search + cross-frame dedup. **ProductReview** is human/AI-moderation gated.
- Provenance: `Product.extractionResultId` ties a published product back to the AI draft it came from.

### 4.4 Inventory (P1)
- **InventoryLocation** (store/warehouse/pickup) × **ProductVariant** → **InventoryItem** (`onHand`, `reserved`, `reorderPoint`). `available = onHand − reserved`.
- **StockMovement** is an append-only ledger; every `InventoryItem` change writes a signed movement (incl. `EXTRACTION_SEED` for AI-onboarded stock and `RESERVATION`/`RELEASE` for checkout holds).

### 4.5 Customers & commerce (P1)
- **Customer** (end shopper; distinct from platform **User**) ↔ **Address** (1:N). GDPR: tenant is *controller*, AICOS is *processor*.
- **Cart**/**CartItem** (pre-checkout) → converts to **Order**/**OrderItem**. Cart supports `abandonedAt` for the ABANDONED_CART automation and a future split-payment design.
- **Return**/**ReturnItem** model the RMA lifecycle (`REQUESTED → APPROVED → RECEIVED → REFUNDED`/`REJECTED`) against an **Order**; `ReturnItem` references the original `OrderItem` with a returned `quantity`, and on `REFUNDED` links to the `Refund` + a `RETURN` `StockMovement` back into inventory.
- **Order** carries the full money breakdown in cents, `applicationFeeCents` (AICOS platform fee), and **immutable JSON snapshots** of shipping/billing addresses + line-item titles/prices (so historical orders survive product edits/deletes).
- Three independent status axes: `OrderStatus`, `FinancialStatus`, `FulfillmentStatus`.

### 4.6 Payments & shipping (P1)
- **Payment** (Stripe Connect destination charge) → **Refund** (`reverseTransfer`, `refundApplicationFee` flags per the platform refund policy). **Discount** (mirrors Stripe Coupon) and **GiftCard** (custom balance ledger — Stripe has no native gift-card product).
- **ConnectAccount** (one per tenant, `@@unique([tenantId])`) mirrors the tenant's Stripe Connect onboarding/capability state (`chargesEnabled`, `payoutsEnabled`, `detailsSubmitted`, `requirements` JSON) — the destination of every destination charge.
- **Dispute** → **DisputeEvidence** track chargeback liability: the dispute links to its `Payment`, carries `amountCents`/`status`/`reason`/`evidenceDueBy`, and evidence rows (text or `mediaAssetId`-backed) are assembled and submitted once before the deadline.
- **Shipment** behind a provider abstraction (Shippo P1, PostNord direct P2). `labelUrlCached` because aggregator label URLs expire — cache to S3/R2.

### 4.7 Media (P1)
- **MediaAsset** is the single store for source videos, extracted frames, product images, theme assets. `isTemporary` flags `temp/`-prefix frames (48-hour R2 lifecycle). `phash` supports frame dedup; `checksumSha256` supports idempotent uploads.

### 4.8 AI extraction — FLAGSHIP (P2 — `ai-extraction`)
The 5-stage BullMQ pipeline maps to these tables:
- **ExtractionJob** — one upload → draft catalog. Tracks `status` (the pipeline stages), provider routing (`primaryProvider = GEMINI`, `fallbackProvider = ANTHROPIC`), `aiCostMicros`, `creditsConsumed`, and a **`dedupKey` (unique)** built from `tenantId + s3ETag` for BullMQ idempotency. `source` supports the `PHOTO_BATCH` privacy fallback and `WOOCOMMERCE_IMPORT` migration path.
- **ExtractionFrame** — per keyframe: `blurScore` (Laplacian variance), ZXing `barcode`, `providerUsed`, raw LLM JSON, `confidence`.
- **ExtractionResult** — deduplicated candidate product with `overallConfidence` + per-field `fieldConfidence` JSON and `dedupGroupKey` (pgvector cosine ≥ 0.92). Shelf-quantity estimation lives here (`estimatedFacings`, `estimatedQuantity`, `quantityConfidence`) so an accepted draft can seed `InventoryItem` via a `StockMovementType.EXTRACTION_SEED` movement.
- **ExtractionReviewItem** — the **human verification gate**. `decision` ∈ {PENDING, ACCEPTED, EDITED, REJECTED, MERGED, SPLIT}; `editedFields` captures owner overrides. A `Product` is created/activated **only** after an explicit accept. JOB 6 (publish) is never triggered automatically.

### 4.9 AI core & content (P2 — `ai-core`, `content`)
- **AiAgentRun** — one run of any of the 12 agents (`AiAgentType`), provider-agnostic, with token counts/latency/cost. Emitted by `packages/ai-core`.
- **AiUsageEvent** — fine-grained `ai.usage` metering (vision/completion/embedding) that billing subscribes to for credit deduction. Split from `AiAgentRun` for high-volume writes.

### 4.10 Store builder & themes (P3 — `store-builder`, `theme-engine`)
- **ThemeConfig** — versioned per store (`@@unique([storeId, version])`); `tokens`/`layout` JSON, `inspirationSourceUrl` (website-cloning = visual inspiration, not copying), `aiGenerated` + `generatedByRunId` provenance.

### 4.11 Growth & intelligence (P4 — `google`, `marketing`, `analytics`, `pricing`, `customer-service`)
- **OAuthConnection** (per tenant × Google service) stores encrypted `accessToken`/`refreshToken`, `grantedScopes` (consent unbundling, May 2025), and service identifiers (`merchantId`, `ga4PropertyId`, `ga4MeasurementId`, `ga4ApiSecret`, `gbpAccountId`, `gscSiteUrl`, `gtmContainerId`).
- **IntegrationConnection** for API-key integrations (Shippo/EasyPost/PostNord/SendGrid/ad APIs); secrets referenced via Doppler `secretRef`, never raw.
- **AdCampaign** (AI Marketing agent; drafts require human approval). **AnalyticsSnapshot** (daily BI rollup; raw events in GA4). Pricing & customer-service agents run through `AiAgentRun`.

### 4.12 Automation (P5 — `automation`)
- **Automation** (trigger → conditions → actions JSON; `cron` for scheduled) → **AutomationRun** execution log.

### 4.13 Cross-cutting
- **WebhookEndpoint** / **WebhookDelivery** (outbound, HMAC-signed, retried).
- **AuditLog** — immutable (INSERT-only RULE P0–P3; migrate to S3 Object Lock WORM before SOC 2 Type II). `tenantId` nullable for platform events.
- **DsarRequest** — GDPR export/erasure, 30-day SLA, processed by the worker's nightly retention job.

---

## 5. Indexing Strategy

| Pattern | Rule | Reason |
|---|---|---|
| Tenant scan | **Every** tenant model has `@@index([tenantId])` | RLS adds `tenant_id = ...` to every query |
| Tenant pagination | **Every** tenant model also has `@@index([tenantId, createdAt])` | Composite avoids full table scans on paginated tenant lists under RLS |
| Natural keys | `@@unique([tenantId, slug])`, `@@unique([tenantId, sku])`, `@@unique([tenantId, code])`, `@@unique([tenantId, email])` | Per-tenant uniqueness without colliding across tenants |
| Status filters | `@@index([status])` on Product/Order/Job/Subscription/etc. | Dashboards filter heavily by status |
| Lookups | `barcode`, `trackingNumber`, `stripe*Id`, `dedupKey` indexed/unique | External ID reconciliation & webhook idempotency |
| Vector | `ProductEmbedding.embedding vector(512)` gets an **HNSW** index (raw SQL) | pgvector ANN for semantic search + dedup |
| Trigram | `pg_trgm` GIN on `Product.title` / `searchKeywords` (raw SQL) | Fuzzy fallback before Meilisearch reconcile |

Append-only ledgers (`CreditTransaction`, `StockMovement`, `AiUsageEvent`, `AuditLog`) are indexed on `(tenantId, createdAt)` for time-range reporting and never updated in place.

---

## 6. Migrations Strategy

- **Tooling:** `prisma migrate` for schema DDL; **raw-SQL appendices** for RLS policies, pgvector/HNSW/trigram indexes, INSERT-only audit RULEs, and extension creation (`CREATE EXTENSION IF NOT EXISTS vector, citext, pg_trgm, pgcrypto`).
- **Execution:** Migrations run as a **Kubernetes pre-deploy Job** (and a one-shot container locally) — **never inside NestJS startup** (multiple pods racing migrations corrupts state).
- **RLS coupling:** each migration that creates a tenant table ships a paired `_rls/<name>.sql` enabling + forcing RLS and creating the isolation policy. CI fails if a `tenantId` model has no paired RLS file.
- **Money & enums:** enum changes are additive-only in production (drop/rename of enum values requires a multi-step migration). Money columns are `Int` (cents); no migration may introduce `Float`/`Decimal` for currency.
- **Zero-downtime:** expand-then-contract for column renames; backfills run as idempotent BullMQ jobs, not in the migration transaction.
- **Region routing:** EU tenants' data targets EU-region Postgres from day one (`Tenant.dataRegion = EU`); retrofitting residency post-growth is costly.

---

## 7. Seeds Strategy

`prisma/seed.ts` (idempotent, upsert-based) provisions a working local/dev environment matching `.env.example`:

1. **Plans** — FREE (1 extraction, 20 products), STARTER (≤ $29/mo to remove price as a switching barrier), GROWTH, PRO, ENTERPRISE with entitlement limits + included credits.
2. **System roles** — platform-global `PLATFORM_SUPER_ADMIN`, `AGENCY_RESELLER`, and per-tenant `STORE_OWNER`/`STORE_MANAGER`/`STORE_STAFF` with permission sets.
3. **Platform super admin** user from `SUPER_ADMIN_EMAIL`/`SUPER_ADMIN_PASSWORD`.
4. **Demo tenant** ("Demo Store") + owner from `DEMO_ADMIN_EMAIL`, with a default `Store`, `InventoryLocation`, one `Category`/`Brand`, and a handful of `Product`/`ProductVariant`/`InventoryItem` rows.
5. **Demo `ExtractionJob`** in `AWAITING_REVIEW` with sample `ExtractionResult` + `ExtractionReviewItem` rows (varying confidence) so the human-review UI is demoable without running the AI pipeline.
6. **CreditBalance** rows seeded to plan-included amounts.

Seeds must respect RLS: the seed runner connects as a role with `BYPASSRLS` (migration role) or sets `app.current_tenant` per tenant block.

---

## 8. Backup, Retention & DR

| Topic | Approach |
|---|---|
| Backups | Managed Postgres automated daily snapshots + **PITR (WAL archiving)**, 30-day retention; weekly logical `pg_dump` to a separate R2 bucket for cold archive |
| RPO / RTO | Target RPO ≤ 5 min (WAL), RTO ≤ 1 h via snapshot restore + WAL replay |
| Restore drills | Quarterly restore-to-staging test; documented runbook |
| Object storage | R2/S3 versioning on the media bucket; `temp/` prefix has a **48-hour lifecycle expiry** (frame JPEGs accumulate fast) |
| Retention enforcement | Nightly BullMQ worker enforces per-table retention (e.g. abandoned carts, expired sessions, soft-deleted rows past grace) and processes `DsarRequest` erasures |
| GDPR erasure | Soft-delete (`deletedAt`) first; hard-erase/anonymize of `Customer` PII via the DSAR worker within the 30-day SLA; audit logs retain a non-PII tombstone |
| Audit immutability | INSERT-only RULE on `audit_logs` (P0–P3); migrate to **S3 Object Lock WORM** before SOC 2 Type II |
| Secrets | Doppler across dev (Docker Compose) and prod (K8s); `IntegrationConnection.secretRef`/encrypted token columns reference, never store raw secrets in the DB in plaintext |

---

## 9. Open Items / Deferred

- **Schema-per-tenant** path for enterprise tenants (D-006) — reserved, not built in P0; the `tenantId` everywhere keeps a clean migration story.
- **Multi-seller split cart** (Separate Charges + Transfers) — order model already snapshots per-store data to allow it; full implementation deferred to P2.
- **pgvector column types** (`embedding vector(512)`) and HNSW indexes are declared in raw SQL, not Prisma-typed (Prisma has no native vector type as of 6.x).
- **i18n / multi-currency** at the field level — currency is per-store/variant now; localized content tables (translations) deferred to P2/P3 with the top-5 language rollout.

---

## Schema Deferred to Phase

Entities the proposal references but that are **intentionally NOT yet modeled** in `prisma/schema.prisma`. Each is a tracked decision (not an oversight): the table below records the target phase so the gap is visible rather than silent. Status for every row is **deferred (intentional)**.

| Deferred entity / group | Module | Target phase | Status | Note |
|---|---|---|---|---|
| `Collection`, `Attribute`, `Option`, `OptionValue` | catalog | P1–P2 | deferred (intentional) | Variant options live as JSON on `ProductVariant.options` for P1; normalize to relational option/attribute tables when merchandising/faceting lands |
| `NotificationTemplate` + notification preferences | notifications | P1 | deferred (intentional) | `Notification.template` is a string key for now; template registry + per-tenant/customer channel preferences modeled later in P1 |
| `Conversation`, `CsMessage`, `Ticket`, `KnowledgeBase` | customer-service | P4 | deferred (intentional) | Customer-service agent runs through `AiAgentRun`; durable conversation/ticket/KB storage is a P4 build |
| `PriceSuggestion`, `PricingRule` | pricing | P4 | deferred (intentional) | Pricing agent runs through `AiAgentRun`; suggestion/rule persistence deferred to P4 |
| `Forecast`, `AnalyticsEvent` | analytics | P4 | deferred (intentional) | `AnalyticsSnapshot` holds the daily BI rollup; raw event stream + demand forecasts deferred to P4 |
| `StoreBlueprint`, `BuilderJob`, `StorePage`, `StoreSettings`, generated branding/logo + clone-analysis artifacts | store-builder | P3 | deferred (intentional) | `ThemeConfig` covers theme tokens/layout + clone provenance for now; full builder job/page/settings + generated-branding artifacts are a P3 build |
| Field-level translation tables | i18n | P2–P3 | deferred (intentional) | Currency is per-store/variant today; localized content (translation) tables land with the top-5 language rollout (see §9) |
