# AICOS — In Progress

> **PHASE 2 — Production-Hardening (wrapping up) + AI-extraction flagship (kicked off).** Phase 1 Core Commerce MVP feature-complete (M1.1–M1.6, exit review 🟢 GO, tagged `v0.1.0-mvp`). Trunk: `main`.
> Last updated: 2026-06-04.

## Phase 2 — Production-Hardening milestones

| Milestone | Status | Notes |
|-----------|--------|-------|
| **P2.1** Test suite + CI gating | ✅ Done | Jest suites across: pure logic (RBAC match, platform-fee math, CSV parsing, pagination), **services** (shipping, returns, orders, gdpr — mocked Prisma/Stripe/Notifications), **worker processors** (notifications, dsar — `@aicos/db` `withTenant` mocked) + email templates; plus the pre-existing roles.guard spec and the db RLS isolation (Vitest). **67 tests / 12 suites green** (api 52 / worker 15). CI **already gates `pnpm test`** (Postgres+Redis + RLS) on every PR. Enhancement (non-blocking): promote the contract smokes to in-runner DB-integration tests (they already provide integration coverage as scripts). |
| **P2.2** Auth/session security | ✅ Done | **httpOnly cookie sessions** (access+refresh) — JwtStrategy reads cookie→Bearer fallback; login/refresh/logout set/rotate/clear cookies. **CSRF** double-submit guard (cookie sessions only; Bearer skipped). **Rate limiting** (`@nestjs/throttler` 200/min global, 10/min auth). **CORS** locked to explicit origins. Admin app: cookie creds + **silent refresh** + CSRF header, **no more localStorage token**. Verified — auth smoke 8/8 (cookie auth, CSRF 403→201, Bearer fallback, refresh rotation, 429) + csrf.guard spec. 72 unit tests, gates green. (Existing refresh **rotation/revocation** machinery reused.) |
| **P2.3** Live integrations | 🟨 In progress | **Email LIVE** — worker delivers real SMTP mail (Mailhog); `MailService` verifies SMTP on boot; live smoke 5/5 (order-paid → confirmation email physically in Mailhog, real providerMessageId). **Runbook** `.ai/runbooks/live-integrations.md` (Stripe + Shippo + SMTP). Pending **test keys** (user): Stripe e2e via `stripe listen`; Shippo auto-label. |
| **P2.4** Perf + observability | ✅ Done | Worker **MetricsService** + `QueueMetricsService` (10s poll) → `aicos_queue_depth{queue,state}` gauges + business counters (`orders_paid_total`, `notifications_total{status}`, `dsar_processed_total{type}`) wired into the processors; verified live on worker `/metrics` (real Redis counts). **k6** load script (`perf/k6/storefront.js`), **Prometheus alerts** (`ops/prometheus/alerts.yml`), observability + **DB index review** runbook. Gates green; 72 unit tests. |
| **P2.5** Ops / CD | ✅ Done (backend) | Multi-stage **Dockerfiles** for api + worker (pnpm monorepo; prisma generate on alpine); `.dockerignore`; `docker/docker-compose.apps.yml` (apps on the infra network); **CI `docker` job** builds both images; `.ai/runbooks/deployment.md` (Doppler secrets, KEDA autoscale on `aicos_queue_depth`). Worker image built locally (exit 0). Follow-up: web/admin Next `standalone` images + `pnpm deploy`/distroless slimming. |

## AI-extraction flagship — kicked off (feature track)

| Item | Status | Notes |
|------|--------|-------|
| Extraction loop (vertical slice) | ✅ Kicked off | API `ExtractionModule` (`/extractions` create/list/get + **accept→DRAFT product** human gate, RBAC `extraction:*`); worker pipeline shape `QUEUED→INGESTING→ANALYZING→MERGING→AWAITING_REVIEW` persisting Frame/Result/ReviewItem; **mock analyzer** (3 products, per-field confidence) is the single swap-point for live AI. Verified — kickoff smoke 9/9. Plan + roadmap: `.ai/features/ai-product-extraction/kickoff.md`. |
| Live AI (Gemini vision, FFmpeg, YOLO/ZXing, CLIP dedup, enrich) | 🟦 Next | Drop-in per the roadmap — no schema/contract changes needed. Implement `@aicos/ai-core` Gemini `vision()` first. Plus the admin review UI (triage bands). |

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
