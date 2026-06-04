# AICOS — In Progress

> **PHASE 2 — Production-Hardening (wrapping up) + AI-extraction flagship (kicked off).** Phase 1 Core Commerce MVP feature-complete (M1.1–M1.6, exit review 🟢 GO, tagged `v0.1.0-mvp`). Trunk: `main`.
> Last updated: 2026-06-04.

## Phase 2 — Production-Hardening milestones

| Milestone | Status | Notes |
|-----------|--------|-------|
| **P2.1** Test suite + CI gating | ✅ Done | Jest suites across: pure logic (RBAC match, platform-fee math, CSV parsing, pagination), **services** (shipping, returns, orders, gdpr — mocked Prisma/Stripe/Notifications), **worker processors** (notifications, dsar — `@aicos/db` `withTenant` mocked) + email templates; plus the pre-existing roles.guard spec and the db RLS isolation (Vitest). **67 tests / 12 suites green** (api 52 / worker 15). CI **already gates `pnpm test`** (Postgres+Redis + RLS) on every PR. Enhancement (non-blocking): promote the contract smokes to in-runner DB-integration tests (they already provide integration coverage as scripts). |
| **P2.2** Auth/session security | ✅ Done | **httpOnly cookie sessions** (access+refresh) — JwtStrategy reads cookie→Bearer fallback; login/refresh/logout set/rotate/clear cookies. **CSRF** double-submit guard (cookie sessions only; Bearer skipped). **Rate limiting** (`@nestjs/throttler` 200/min global, 10/min auth). **CORS** locked to explicit origins. Admin app: cookie creds + **silent refresh** + CSRF header, **no more localStorage token**. Verified — auth smoke 8/8 (cookie auth, CSRF 403→201, Bearer fallback, refresh rotation, 429) + csrf.guard spec. 72 unit tests, gates green. (Existing refresh **rotation/revocation** machinery reused.) |
| **P2.3** Live integrations | ✅ Code-complete | **Email LIVE** (real SMTP→Mailhog, verify-on-boot, smoke 5/5). **Shippo auto-label** implemented — `ShippoService` (cheapest-rate → buy label, gated on `SHIPPO_API_KEY`, manual fallback) wired into `POST /orders/:id/shipments {buyLabel:true}`; unit-tested (request shaping + fallback). **Stripe** code-complete since M1.3. **Runbook** `.ai/runbooks/live-integrations.md`. Remaining is **live runs only** (user-driven): Stripe e2e via `stripe listen` + browser; Shippo with a test key + a default ship-from address (+ capture order shippingAddress — small follow-up). |
| **P2.4** Perf + observability | ✅ Done | Worker **MetricsService** + `QueueMetricsService` (10s poll) → `aicos_queue_depth{queue,state}` gauges + business counters (`orders_paid_total`, `notifications_total{status}`, `dsar_processed_total{type}`) wired into the processors; verified live on worker `/metrics` (real Redis counts). **k6** load script (`perf/k6/storefront.js`), **Prometheus alerts** (`ops/prometheus/alerts.yml`), observability + **DB index review** runbook. Gates green; 72 unit tests. |
| **P2.5** Ops / CD | ✅ Done (backend) | Multi-stage **Dockerfiles** for api + worker (pnpm monorepo; prisma generate on alpine); `.dockerignore`; `docker/docker-compose.apps.yml` (apps on the infra network); **CI `docker` job** builds both images; `.ai/runbooks/deployment.md` (Doppler secrets, KEDA autoscale on `aicos_queue_depth`). Worker image built locally (exit 0). Follow-up: web/admin Next `standalone` images + `pnpm deploy`/distroless slimming. |

## AI-extraction flagship — kicked off (feature track)

| Item | Status | Notes |
|------|--------|-------|
| Extraction loop (vertical slice) | ✅ Kicked off | API `ExtractionModule` (`/extractions` create/list/get + **accept→DRAFT product** human gate, RBAC `extraction:*`); worker pipeline shape `QUEUED→INGESTING→ANALYZING→MERGING→AWAITING_REVIEW` persisting Frame/Result/ReviewItem; **mock analyzer** (3 products, per-field confidence) is the single swap-point for live AI. Verified — kickoff smoke 9/9. Plan + roadmap: `.ai/features/ai-product-extraction/kickoff.md`. |
| Admin review UI | ✅ Done | `/extraction` — jobs list + start-from-mediaId + inline **triage-band result grid** (confidence → High/Good/Review/Low) with **accept→DRAFT product**; 'AI Extraction' nav activated. Build green. |
| Media upload UI | ✅ Done | `/extraction` uploads a shelf video → presigned PUT → confirm → starts extraction in one click (MinIO/S3; manual media-id fallback kept). |
| Gemini vision (live-ready) | ✅ Implemented | `@aicos/ai-core` `GeminiProvider.vision()` calls the Generative Language REST API (gated on `GEMINI_API_KEY`, router fallback otherwise). Worker `ExtractionAnalyzer` routes frames through `extraction.primary` → Gemini, parses JSON products, **falls back to the mock** on no-key/no-frames/error. Unit-tested (vision parse, fences, error→mock); extraction smoke 6/6 intact. |
| Frame sampling (JOB 1) | ✅ Done | Worker `FrameSamplerService` pulls the job's `sourceMediaId` from S3/MinIO and samples real frames with **ffmpeg** (video → up to 6 downscaled JPEGs @1fps; image → pass-through), feeding real `AiImage`s to the vision call. Processor INGESTING persists real `ExtractionFrame` rows (timestamps) and **gracefully falls back** to placeholder frames + mock when no media / no S3 / decode error. ffmpeg via `ffmpeg-static` locally, apk `ffmpeg` + `FFMPEG_PATH` in the worker image. Verified — real-ffmpeg integration test samples a generated clip (worker 24 tests); typecheck 14 / lint 13 / build 9 / test 8 green. |
| Live AI run | ⚙️ Ready — needs key | Browser-upload **CORS verified** (MinIO `MINIO_API_CORS_ALLOW_ORIGIN`, preflight 204 for the admin origin) + **real-MinIO sampling verified** (upload→download→ffmpeg JPEG frames). Only blocker for live extraction is a `GEMINI_API_KEY` (Google AI Studio, `gemini-2.0-flash`). Steps: `.ai/runbooks/live-integrations.md` §4. |
| Extraction refinements | ✅ Done (sampling) | **Even-spaced sampling** — ffprobe reads duration, frames spread across the whole clip (`fps = maxFrames/duration`, clamped). **Perceptual dedup** — 9×8 grayscale **dHash** per frame (emitted as an aligned 2nd ffmpeg output) drops near-identical frames (Hamming < 6). Verified by real-ffmpeg tests (mandelbrot → distinct kept; solid color → collapses to 1) + pure unit tests; worker 28 tests, full gates green. ffprobe via `ffprobe-static` locally, apk `ffmpeg` (bundles ffprobe) + `FFPROBE_PATH` in the image. Remaining nicety: blur scoring (Laplacian variance) + CLIP/enrich. |
| #4 shippingAddress | ✅ Done | Checkout enables `shipping_address_collection` (`CHECKOUT_SHIPPING_COUNTRIES`); the `checkout.session.completed` webhook persists `order.shippingAddress` (+ billing snapshot + buyer email) in the shape `ShippingService.toAddress()` reads → live Shippo now has a ship-to. Tested with a mock Stripe session payload (worker 30 tests). |

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
