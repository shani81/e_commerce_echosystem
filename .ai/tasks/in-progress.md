# AICOS — In Progress

> **PHASE 1 — Core Commerce MVP** (in progress). Trunk: `main`. Current work: branch `feat/m1.2-search`. Phase 0 complete (exit review 🟢 GO).
> Last updated: 2026-06-03.

## Phase 1 milestones

| Milestone | Status | Notes |
|-----------|--------|-------|
| **M1.1** Catalog + inventory + media (+ admin CRUD) | ✅ Done | API + admin UI; verified (smoke 17/17, build 11 routes). |
| **M1.2** Meilisearch + tenant tokens + storefront browse | ✅ Done | Meili index sync on catalog mutations; tenant search + per-tenant search token; PUBLIC storefront (store-slug→tenant) browse/search/detail; web `/shop` + `/products/[slug]`. **Verified live (smoke 13/13).** |
| **M1.3** Stripe Checkout + Connect + tax + order-on-payment | 🟦 Planned | |
| **M1.4** Shipping (Shippo) labels/tracking + notifications | 🟦 Planned | |
| **M1.5** Customer portal + returns scaffolding | 🟦 Planned | |
| **M1.6** GDPR DSAR + CSV/WooCommerce import | 🟦 Planned | |

## M1.2 — delivered
- **Search (API)**: `MeiliService` (index + settings; graceful no-op without a key), `SearchIndexerService` (`syncProduct`/`removeProduct`/`reindexTenant`) wired best-effort into catalog product/variant mutations. `GET /search/products` (tenant search), `POST /search/reindex`, `POST /search/token` (per-tenant scoped token, 1h TTL).
- **Storefront (API, PUBLIC)**: `/storefront/:storeSlug`, `/storefront/:storeSlug/products` (Meili-backed, PUBLISHED only, DB fallback), `/storefront/:storeSlug/products/:productSlug`. Store-slug → tenant resolution (dev; production resolves by domain).
- **Web storefront**: `/shop` (store name + search + product grid) and `/products/[slug]` (detail) via a public storefront client; linked from the landing.
- **Fix**: RBAC guard now treats `*:*` (the seeded owner grant) as full access, not just `*`.

## Next
1. **M1.3** — Stripe Checkout + Connect onboarding + Tax; create an order on successful payment (cart → checkout).
2. Carry-forward: move search-sync onto the BullMQ outbox (currently best-effort inline); domain-based storefront tenant resolution; cart/session.
