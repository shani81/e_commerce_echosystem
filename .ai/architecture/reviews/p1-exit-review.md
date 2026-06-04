# Phase 1 — Core Commerce MVP — Exit Review

**Date:** 2026-06-04 · **Trunk:** `main` (M1.1–M1.6 merged: PRs #1–#3) · **Reviewer:** Architecture Review Board (automated)
**Decision: 🟢 GO — Phase 1 Core Commerce MVP is feature-complete and verified end-to-end.** A store can be set up, browsed, bought, paid, fulfilled, returned, and is GDPR-operable. This is **feature-complete, not yet production-hardened**: a defined set of items (live third-party credentials, perf/scale, automated test suite, security hardening) is carried forward to a Phase 2 hardening track. None are blockers for the MVP milestone.

## Milestone status

| Milestone | Status | Evidence |
|-----------|--------|----------|
| **M1.1** Catalog + inventory + media (+ admin CRUD) | ✅ Done | Products/variants/categories/brands, publish gate, images; inventory items + append-only `StockMovement` ledger + low-stock; S3/MinIO presign. Admin CRUD screens. **Smoke 17/17**; `next build` 11 routes. |
| **M1.2** Search + storefront browse | ✅ Done | Meilisearch index sync on catalog mutations; tenant search + per-tenant token; PUBLIC storefront (store-slug→tenant) browse/search/detail; web `/shop` + `/products/[slug]`. **Live smoke 13/13.** |
| **M1.3** Checkout + payments + Connect | ✅ Done | Cart → Stripe Checkout (Connect **destination charge** + application fee + Stripe Tax); idempotent webhook worker → order PAID + Payment + stock decrement + cart converted; Connect onboarding; admin orders + refunds; web cart/checkout. **Contract smoke 19/19** (live Stripe deferred). |
| **M1.4** Shipping + transactional notifications | ✅ Done | Manual-carrier shipments + fulfillment (`/shipments/:id/ship` → order FULFILLED); **notifications pipeline** (`notifications` queue → worker `MailService`/nodemailer→SMTP, log-only without SMTP) — order_confirmation, shipment_tracking, return emails. Shippo auto-label gated on `SHIPPO_API_KEY`. |
| **M1.5** Customer portal + returns | ✅ Done | Public order lookup + return requests; admin returns (approve/reject/**refund** → restock RETURN ledger + Stripe refund when captured); web `/orders` portal. |
| **M1.6** GDPR DSAR + import | ✅ Done | DSAR export/erase (admin sync + public intake → `dsar` worker, pseudonymizes customer+orders+addresses, immutable `AuditLog`); CSV/WooCommerce/JSON product importer → DRAFT products. |

## Quality gates (all green on `main`)
- **typecheck** 14/14 · **lint** 13/13 (0 errors) · **build** 9/9 (api/worker nest builds + web/admin `next build`).
- **Contract smokes** (live, against Postgres + Redis + Meilisearch + the worker): M1.1 **17/17**, M1.2 **13/13**, M1.3 **19/19**, M1.4–M1.6 **20/20**. The M1.4–M1.6 run exercised the full lifecycle: order PAID → 4 notification emails through queue→processor; shipment → FULFILLED + tracking email; portal return → approve → refund → **restock 8→9**; CSV import; GDPR erasure scrubbing the order email.

## Verification method — and its limits (honest scope)
- Verification is **contract-level smoke tests** driving the real API + worker against real infra — strong evidence the happy paths and key edge cases work. It is **not** a full automated unit/integration suite (Jest/Vitest), and not load/perf testing.
- **Third-party integrations are exercised in graceful-degradation mode** (no live keys): Stripe Checkout/refunds via a synthetic verified webhook + 503-when-unconfigured; SMTP via log-only; Shippo not called (manual carrier path). Real-credential runs (`stripe listen`, Mailhog/SendGrid, Shippo test) are carried forward.

## Readiness (MVP stage, 0–100) — updated from P0
Architecture 70 · Tenant isolation 60 · Documentation 74 · Scalability 44 · Security 46 · UI/UX 52 · Performance 18 · Code quality 58 · Enterprise readiness 50 · **Overall 54.**
Rationale vs P0 (overall 38): the full commerce feature set + three real UIs (storefront, admin, customer portal) now exist and are verified; isolation/auth/observability remain solid. **Held down by:** perf/scale still unproven under load (18), security hardening pending (JWT-in-localStorage, email+order-# guest auth), and no automated test suite yet.

## Key risks — status
- **Cross-tenant leakage (Critical):** mitigated & proven — FORCE RLS + `aicos_app` non-superuser role + `withTenant`/`withSystem`; every new M1.4–M1.6 service is tenant-scoped; webhook/DSAR workers use `withTenant` with tenant resolved from event/record. Dev now runs with `APP_DATABASE_URL` so RLS is enforced locally too.
- **Payment integrity:** idempotent webhook worker (Redis marker + Stripe-id upserts); refunds reverse Connect transfers. **Not yet run against live Stripe** (carry-forward).
- **PII / GDPR:** erasure pseudonymizes customer + orders + addresses + writes `AuditLog`; 30-day SLA tracked on `DsarRequest`. Guest auth for portal/DSAR is email + order-# (low assurance) → harden to verified login before production.
- **Notification reliability:** at-least-once via BullMQ + `Notification` row status; SMTP failures retry. No bounce/complaint handling yet.
- **Security hardening (High):** JWT in localStorage (admin/web), guest-auth assurance, rate limiting, secrets via env/.keys — all flagged for the Phase 2 hardening track.

## Carried forward (non-blocking)
1. **Live third-party runs:** Stripe test keys + `stripe listen` end-to-end; Shippo auto-label purchase + live rates; real SMTP (Mailhog/SendGrid) delivery checks.
2. **Test suite:** automated unit/integration tests (the smokes become the seed); CI gating on them.
3. **Hardening:** httpOnly-cookie sessions + silent refresh; verified customer accounts; rate limiting; Doppler secrets; app container images.
4. **Perf/scale:** load tests; BullMQ queue-depth gauges + dashboards/alerts; search-sync via outbox; DB indices review under load.
5. **Polish:** themed/branded emails; DSAR export bundle → signed S3 URL; promo/discount + tax lines in cart UI; domain-based storefront resolution; customer management admin screens.

## Phase 2 entry criteria — met
A complete, manually-operable commerce loop exists on `main` (catalog→search→cart→checkout→payment→fulfillment→returns→GDPR), verified end-to-end, with multi-tenant isolation enforced and an extensible queue/worker + notifications backbone to build on.

**Proceed to Phase 2** — recommended split: (a) a **production-hardening track** (live integrations, tests, auth/security, perf) to take this MVP to production-ready; and (b) the **AI-extraction flagship** (video → draft catalog), the product's core differentiator. Tag this milestone **`v0.1.0-mvp`**.
