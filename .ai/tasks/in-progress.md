# AICOS — In Progress

> **PHASE 1 — Core Commerce MVP** (in progress). Branch: `phase-1-core-commerce`. Phase 0 is complete (exit review 🟢 GO — `.ai/architecture/reviews/p0-exit-review.md`).
> Last updated: 2026-06-03.

## Phase 1 milestones

| Milestone | Status | Notes |
|-----------|--------|-------|
| **M1.1** Catalog + inventory + media (+ admin CRUD) | 🟨 In Progress | **API done & verified** — catalog (20 endpoints), inventory (11), media presign. Remaining: admin dashboard CRUD **UI** wiring. |
| **M1.2** Meilisearch + tenant tokens + storefront browse | 🟦 Planned | |
| **M1.3** Stripe Checkout + Connect + tax + order-on-payment | 🟦 Planned | |
| **M1.4** Shipping (Shippo) labels/tracking + notifications | 🟦 Planned | |
| **M1.5** Customer portal + returns scaffolding | 🟦 Planned | |
| **M1.6** GDPR DSAR + CSV/WooCommerce import | 🟦 Planned | |

## M1.1 — delivered this commit (API)
- **Catalog**: products + variants, categories (self-ref tree), brands; publish gate (DRAFT→ACTIVE); product images link a `MediaAsset`. Tenant-scoped via `PrismaService.forTenant`; RBAC `catalog:read/write`; per-tenant unique keys → 409.
- **Inventory**: locations, inventory items (computed `available = onHand − reserved`), stock adjustments writing the append-only `StockMovement` ledger, low-stock alerts; only `ADJUSTMENT` movements may drive stock negative.
- **Media**: presigned S3/MinIO upload → confirm → get (download URL) → delete; `MediaAsset` rows; `@aws-sdk/client-s3` + `s3-request-presigner` + S3 config (503 when unconfigured, no boot crash).
- **Hardening**: pagination `?take`/`?skip` robustness; `declaration:false` for Nest apps (TS2742); web/admin lint on the shared flat config; `ui` empty-interface fix.

## Next
1. **M1.1 admin UI** — wire the admin dashboard's catalog/inventory pages to these endpoints (real CRUD).
2. **M1.2** — Meilisearch index sync + per-tenant search tokens + storefront product browse.
