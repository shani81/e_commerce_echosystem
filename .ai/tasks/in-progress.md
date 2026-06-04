# AICOS — In Progress

> **PHASE 2 — Production-Hardening (in progress).** Phase 1 Core Commerce MVP is feature-complete (M1.1–M1.6, exit review 🟢 GO, tagged `v0.1.0-mvp`). Trunk: `main`. Current work: branch `feat/p2.1-test-suite`.
> Last updated: 2026-06-04.

## Phase 2 — Production-Hardening milestones

| Milestone | Status | Notes |
|-----------|--------|-------|
| **P2.1** Test suite + CI gating | 🟨 In progress | Pure-logic units (RBAC match, platform-fee math, CSV parsing) + **service tests** (shipping status→fulfillment+notify; returns approve/refund state-machine + restock + manual path, mocked Prisma/Stripe/Notifications) + **worker test runner** (jest) + email-template tests. **50 tests / 8 suites green** (api 44 / worker 6). CI **already gates `pnpm test`** (Postgres+Redis services + RLS) — covers these + the db isolation test. Next: orders/gdpr service tests, worker processor tests, promote contract smokes to DB-integration tests. |
| **P2.2** Auth/session security | 🟦 Planned | httpOnly-cookie sessions + refresh rotation, rate limiting, remove JWT-in-localStorage. |
| **P2.3** Live integrations | 🟦 Planned | Stripe test-mode e2e (`stripe listen`), Shippo auto-label, real SMTP + runbooks. |
| **P2.4** Perf + observability | 🟦 Planned | k6 load tests, BullMQ queue-depth + business metrics, dashboards/alerts, DB index review. |
| **P2.5** Ops / CD | 🟦 Planned | App Dockerfiles, CI build+test gating, Doppler secrets. |

## Phase 1 milestones (✅ complete — see `.ai/architecture/reviews/p1-exit-review.md`)

| Milestone | Status | Notes |
|-----------|--------|-------|
| **M1.1** Catalog + inventory + media (+ admin CRUD) | ✅ Done | API + admin UI; verified (smoke 17/17, build 11 routes). |
| **M1.2** Meilisearch + tenant tokens + storefront browse | ✅ Done | Meili index sync; tenant search + token; PUBLIC storefront browse/detail; web `/shop` + `/products/[slug]`. Verified live (smoke 13/13). |
| **M1.3** Stripe Checkout + Connect + tax + order-on-payment | ✅ Done | Cart → Checkout (Connect destination charge + Stripe Tax), idempotent webhook worker, Connect onboarding, admin orders + refunds, web cart/checkout. Verified (smoke 19/19; live Stripe deferred). |
| **M1.4** Shipping + transactional notifications | ✅ Done | Manual-carrier shipments + fulfillment; **notifications pipeline** (queue → worker SMTP) — order-confirmation, shipment-tracking, return emails. Shippo auto-label gated on `SHIPPO_API_KEY` (carry-forward). |
| **M1.5** Customer portal + returns | ✅ Done | Public order lookup + return requests; admin returns (approve/reject/refund → restock + Stripe refund); web `/orders` portal. |
| **M1.6** GDPR DSAR + CSV/WooCommerce import | ✅ Done | DSAR export/erase (admin sync + public intake → worker fulfilment, AuditLog); CSV/WooCommerce/JSON product importer → DRAFT products. |

**Verified — contract smoke 20/20** (order PAID + emails, shipment → fulfilled + tracking email, portal return → approve/refund + restock, CSV import, GDPR erasure scrubs PII). typecheck 14/14, lint 13/13, build 9/9.

## Phase 1 — what shipped (M1.4–M1.6)
- **Notifications (new pipeline)**: `notifications` BullMQ queue + worker `MailService` (nodemailer → SMTP/Mailhog, graceful log-only without SMTP) + `NotificationsProcessor`; `Notification` rows are the idempotency/audit anchor. Templates: order_confirmation, shipment_tracking, return_approved, return_refunded.
- **Shipping (API)**: `/orders/:id/shipments` create/list, `PATCH /shipments/:id`, `/shipments/:id/ship` → order FULFILLED + buyer tracking email.
- **Returns (API)**: admin `/returns` list/detail/approve/reject/refund (restock RETURN ledger + Stripe refund when a capture exists); public `/storefront/:slug/orders/lookup` + `/returns`.
- **GDPR (API + worker)**: admin `/gdpr/customers/:id/export|erase`, `/gdpr/dsar` log; public `/storefront/:slug/gdpr/request` → `dsar` queue → worker export/erase + AuditLog.
- **Import (API)**: `/imports/products` (CSV / WooCommerce / JSON → DRAFT products, brand upsert, slug dedupe).
- **UI**: web `/orders` customer portal (lookup, status/tracking, return request, GDPR request); admin **Returns**, **Import**, **Privacy** pages + shipment actions on the order detail; nav updated.
- **RBAC/config**: `shipping:* / return:* / gdpr:* / import:write`; SMTP + Shippo config.

## Next
1. **Phase 1 exit review** (like Phase 0): full smoke + GO/NO-GO, then tag the MVP.
2. Carry-forward: Shippo auto-label purchase + rates; live Stripe smoke (test keys); customer accounts (verified login vs email+number lookup); themed/branded emails; DSAR export bundle to signed S3 URL.
