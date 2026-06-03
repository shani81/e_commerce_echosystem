# AICOS — Platform Roadmap (P0–P5)

> **Product:** AI Commerce OS (AICOS) — "Film your shelves. Publish your store. In minutes."
> **North Star:** A non-technical physical-store owner records a short video of their shelves, uploads it, AI extracts the full catalog (names, prices, variants, images, SEO), the owner reviews, clicks **Publish**, and a complete operational online store goes live in **under 15 minutes**.
> **Planning date:** 2026-06-03 · **Status:** PHASE 0 in progress (~15%) · all other phases Planned.
> **Team assumption:** small team — ~3–5 engineers (2 backend/NestJS, 1–2 full-stack/Next.js, 1 AI/ML-leaning), plus part-time design + 1 lead wearing PM/delivery hats. ETAs below assume this team size and ~no scope creep.

---

## How to read this roadmap

- **Phases are strictly sequenced** (P0 → P5). Each phase has an **exit criterion**; the next phase does not start in earnest until it is met. Some early P1 work (e.g. catalog data model) can be drafted late in P0.
- **ETAs are calendar estimates** for a small team, expressed as elapsed weeks from project start (2026-06-03) and as a target window. They are deliberately conservative; the flagship AI work (P2) carries the most uncertainty.
- **Nothing AI-generated auto-publishes.** A human verification gate is an architectural invariant, introduced in P2 and never removed.
- **Module keys** match the SPEC exactly (`iam`, `billing`, `catalog`, …). Do not rename.

| Phase | Name | Calendar window (from 2026-06-03) | Elapsed | Headline outcome |
|-------|------|-----------------------------------|---------|------------------|
| **P0** | Foundation | 2026-06-03 → 2026-08-12 | ~10 wks | Skeleton that is multi-tenant-safe, observable, billable, CI/CD-green |
| **P1** | Core Commerce MVP | 2026-08-12 → 2026-12-09 | ~17 wks | A store can sell — manually entered catalog, real checkout |
| **P2** | The Magic (AI Extraction) | 2026-12-09 → 2027-03-31 | ~16 wks | Video → catalog → human review → publish. The flagship. |
| **P3** | AI Store Builder | 2027-03-31 → 2027-06-09 | ~10 wks | Store + theme generated from a name; website visual cloning |
| **P4** | Growth & Intelligence | 2027-06-09 → 2027-10-06 | ~17 wks | Google sync, marketing/CS/pricing/analytics agents |
| **P5** | Scale & Enterprise | 2027-10-06 → 2028-01-26 | ~16 wks | Automation engine, multi-region, K8s, white-label, compliance |

> **Total to a feature-complete, enterprise-ready platform:** ~86 weeks (~20 months) for a small team. The **flagship demo** (north-star <15-min flow) is reachable at end of **P2 (~Q1 2027)**. P1 alone (~end of 2026) yields a sellable, manual-catalog commerce platform.

---

## P0 — Foundation

**Goal:** Monorepo, Docker infra, IAM + multi-tenancy, billing skeleton, design system, CI/CD, observability baseline.

### Scope
- pnpm monorepo: `apps/{web,admin,api,worker}`, `packages/{ui,config,types,ai-core,shared}`, `docker/`, `prisma/`, `.ai/`.
- Docker Compose for **infrastructure only** (Postgres 16.9+, Redis, Meilisearch, MinIO, Mailhog) on the locked remapped ports (pg 5440, redis 6400, meili 7700, minio 9200/9300, mailhog 8100/1200). Apps run on host via pnpm.
- **Module `iam`** (P0): authentication (JWT RS256, access in memory + refresh as httpOnly cookie), RBAC roles for the six personas, organizations/tenants, team invites.
- **Multi-tenancy core:** shared DB + shared schema + `tenant_id` on every row + **PostgreSQL Row-Level Security with FORCE RLS**. `TenantContextMiddleware` sets both the Postgres session var (via `set_config(..., TRUE)` inside a `$transaction`) and `AsyncLocalStorage`. PgBouncer **transaction pooling mode** with `SET LOCAL`.
- **Module `billing`** (P0): Stripe Billing skeleton — products/prices for Starter/Growth/Pro/Enterprise, customer + subscription objects, webhook ingestion via BullMQ, **metered-usage plumbing provisioned but disabled** (turned on in P2 for AI credits).
- **Design system:** `packages/ui` on shadcn/ui + Tailwind + Framer Motion tokens; base layouts for `web` and `admin`.
- **CI/CD:** GitHub Actions — lint, typecheck, unit tests, Prisma migrate check, build; preview deploy target. Prisma migrations run as a **pre-deploy job**, never in-process.
- **Observability baseline:** structured logging (pino), request/tenant correlation IDs, OpenTelemetry traces, health/readiness endpoints, error tracking (Sentry-style).
- **Secrets:** Doppler wired for dev (Compose) and prod (K8s) with zero code change; trufflehog pre-commit hook.

### Key deliverables
1. Bootable monorepo; `pnpm dev` brings up api (4000), worker (4100), web (3000), admin (3100) against dockerized infra.
2. Working signup → org/tenant creation → login → role-gated route, with RLS proven to block cross-tenant reads (automated test).
3. Stripe test-mode subscription created end-to-end; webhook updates local subscription state.
4. CI green on main; one-command local environment documented.
5. `project-dashboard.html` live and auto-reflecting status (per proposal request).

### Milestones
- **M0.1 (wk 2):** Monorepo + Compose infra + CI skeleton green.
- **M0.2 (wk 4):** Prisma schema v0 with `tenant_id` + RLS policies + FORCE RLS; cross-tenant isolation test passes.
- **M0.3 (wk 6):** IAM: auth + RBAC + tenant context middleware (AsyncLocalStorage + Postgres var).
- **M0.4 (wk 8):** Billing skeleton + Stripe webhooks (BullMQ) + metered plumbing stubbed.
- **M0.5 (wk 10):** Design system base + observability + dashboard; **P0 exit review**.

### Rough ETA
**~10 weeks → target 2026-08-12.**

### Exit criteria
- A new tenant can sign up, invite a teammate, and is hard-isolated at the DB layer (RLS verified by test, not just app logic).
- Stripe test subscription lifecycle works through webhooks.
- CI/CD green; migrations run as pre-deploy job; secrets via Doppler; no secret in git (trufflehog clean).
- Observability: traces + structured logs + health checks present for api and worker.
- 14 P0 security controls (RLS FORCE, transaction-scoped `set_config`, PG ≥16.9, JWT in memory, etc.) implemented and checklisted.

---

## P1 — Core Commerce MVP

**Goal:** Catalog, inventory, orders, payments (Stripe), shipping, customers + portal, admin dashboard, storefront, search, media, notifications. **A store can sell — manually.**

### Scope (modules, all P1)
- **`catalog`** — products, variants (size/color/weight/package), categories, brands, attributes; manual create/edit. Data model designed so AI extraction (P2) writes the same entities.
- **`inventory`** — stock per variant/location, adjustments, low-stock thresholds.
- **`orders`** — draft/pending/paid, partial fulfillment, backorders, returns/exchanges scaffolding. Order model supports **split payments** (multi-seller deferred but schema-ready).
- **`payments`** — **Stripe Checkout (embedded)** + **Connect (Accounts v2, Stripe-managed, destination charges)**; `automatic_tax` on from day one; refunds incl. partial (`reverse_transfer`), application-fee handling; raw-body webhook route configured at bootstrap.
- **`shipping`** — `ShippingProvider` interface; **Shippo** as default aggregator (Bring/PostNord coverage); labels, rates, tracking; `ShipmentRecord` persisted with cached label URLs.
- **`customers`** — customer records + **customer portal** (order tracking, invoices, returns, returns requests).
- **`storefront`** — Next.js customer web: product listing/detail, cart, Checkout, order confirmation; SEO-ready.
- **`admin`** — admin dashboard: revenue/orders/customers/inventory tiles, product & order management.
- **`search`** — **Meilisearch** index per tenant; **tenant tokens** (1-hour TTL) so the storefront queries Meilisearch directly.
- **`media`** — upload via pre-signed URLs to MinIO/R2, multipart for large files, image variants/CDN.
- **`notifications`** — transactional email (Mailhog dev / SendGrid prod) + in-app; order/shipping events.
- **GDPR P1 baseline:** DSAR export + erasure endpoints, nightly BullMQ retention job, DPA template.
- **Migration on-ramp:** WooCommerce/CSV import (research flags WooCommerce migrants as ideal AICOS candidates) — basic importer.

### Key deliverables
1. End-to-end manual sell flow: owner creates products in admin → storefront shows them → shopper checks out via Stripe → funds route to the tenant's connected account → order appears in admin → shipping label generated → customer tracks in portal.
2. Direct-to-Meilisearch storefront search with tenant-token isolation.
3. DSAR export/erasure working before any EU customer.

### Milestones
- **M1.1 (wk 14):** Catalog + inventory + media; admin CRUD.
- **M1.2 (wk 17):** Search (Meilisearch + tenant tokens) + storefront browse.
- **M1.3 (wk 21):** Stripe Checkout + Connect onboarding + tax + webhooks (orders created on payment).
- **M1.4 (wk 24):** Shipping (Shippo) labels/tracking + notifications.
- **M1.5 (wk 26):** Customer portal + returns scaffolding.
- **M1.6 (wk 27):** GDPR DSAR + WooCommerce/CSV import; **P1 exit review**.

### Rough ETA
**~17 weeks → target 2026-12-09.**

### Exit criteria
- A real (test-mode) purchase completes end-to-end with tax, routing to a connected account, refund path, label, tracking, and customer-portal visibility.
- Storefront search runs directly against Meilisearch via tenant tokens (no master key on frontend).
- Stripe webhooks idempotent (timestamp window + event-ID dedupe) via BullMQ.
- DSAR export + erasure endpoints functional; nightly retention job runs.
- At least one external catalog (WooCommerce/CSV) imports cleanly.

---

## P2 — The Magic (AI Extraction) · FLAGSHIP

**Goal:** AI provider abstraction, the flagship video-to-catalog extraction pipeline, product creation agent, human verification layer, AI content + SEO generation. **This is where AICOS becomes uncontested.**

### Scope (modules: `ai-core`, `ai-extraction`, `content`)
- **`ai-core`** — provider abstraction over Anthropic Claude (default), OpenAI, Gemini; swap with no code change; per-call **`ai.usage` events** (provider/model/tokens) feeding billing credit deduction; per-provider rate-limit tracking + exponential backoff + automatic fallback on 429; model IDs pinned in config with fallback IDs.
- **`ai-extraction` [FLAGSHIP]** — staged BullMQ pipeline with deterministic, idempotent job IDs (`tenantId + s3ETag + segmentIndex`):
  1. **VideoIngestWorker** — validate (1080p min, 20-min max, ≤ size cap), multipart upload to R2/MinIO, FFmpeg keyframe extraction.
  2. **Pre-filter** — YOLO product detection + pHash dedup → 60–100 unique frames.
  3. **Zero-cost pass** — ZXing barcode scan → Open Food Facts lookup (auto-fills 20–40% of grocery/FMCG products with **no LLM spend**).
  4. **FrameAnalysisWorkers (×10 concurrent)** — **Gemini 2.5 Flash** first pass in **batches of 8 frames/call**; **Claude Sonnet** fallback for frames < 0.6 confidence; per-field confidence scores.
  5. **Dedup/merge** — **pgvector** (CLIP embeddings, cosine ≥ 0.92) cross-frame product dedup; explicit merge/split surfaced in review UI.
  6. **Catalog-publish (JOB 6)** — **only on explicit user action**, never automatically.
- **Human Verification Layer** — review UI driven by confidence scoring: triage low-confidence/missing-price items first; merge/split; one-click approve. **Mandatory gate** before publish.
- **Product Creation Agent** — turns verified extractions into `catalog` products/variants/SEO using the same entities as P1.
- **`content`** — AI descriptions, meta title/description, keywords, structured data; **DOMPurify** sanitization of all AI HTML (anti stored-XSS).
- **Billing:** enable **metered AI credits** (extraction minutes + generation credits) provisioned in P0; **AiCreditGuard** (Redis per-tier) + BullMQ queue limiter as revenue/abuse protection.
- **Photo-batch fallback** capture path (privacy/unfamiliarity hedge from competitor research).
- **i18n groundwork:** English-first, top-5 language scaffolding.

### Key deliverables
1. **North-star demo:** upload a real ~5-min shelf video → draft catalog with confidence scores in < 3 min → owner reviews/merges/fixes → clicks Publish → live store. End-to-end **< 15 min** for ~100 SKUs.
2. Provider swap demonstrated (Claude ↔ Gemini ↔ OpenAI) with no code change; cost tracked per tenant; credits deducted.
3. Mobile capture guidance (blur/pace warnings) achieving ≥ 70% auto-filled confidence on a good video.

### Milestones
- **M2.1 (wk 30):** `ai-core` abstraction + usage events + fallback chain.
- **M2.2 (wk 34):** Ingest + frame extraction + YOLO/pHash + ZXing/Open Food Facts zero-cost path.
- **M2.3 (wk 38):** Gemini batch analysis + Claude fallback + confidence scoring; pgvector dedup.
- **M2.4 (wk 41):** Human verification UI + Product Creation Agent → publish gate.
- **M2.5 (wk 43):** `content` (descriptions/SEO) + DOMPurify + metered credits + AiCreditGuard; **P2 exit review / flagship demo**.

### Rough ETA
**~16 weeks → target 2027-03-31.** (Highest-uncertainty phase; buffer accordingly.)

### Exit criteria
- A non-technical user completes the full north-star flow in **< 15 minutes** for a ~100-SKU store on a representative video.
- AI extraction **never** auto-publishes; publish requires explicit human approval (architectural test).
- AI cost per 5-min video stays in the **$0.10–$0.15** envelope; per-tenant usage metered and credit-gated.
- Provider abstraction passes a swap test; 429 triggers fallback automatically.
- All AI-generated HTML sanitized; per-field confidence visible in review UI.

---

## P3 — AI Store Builder

**Goal:** AI store generation from a name, website-cloning (visual **inspiration**, not copying), dynamic AI theme generation.

### Scope (modules: `store-builder`, `theme-engine`)
- **`store-builder`** — from a store name (+ optional URL), generate logo/branding, homepage, category pages, policies, and wire to the catalog. **Website Cloning Engine:** screenshot + analyze layout/typography/color/spacing → original, unique implementation. **Never copies HTML or copyrighted assets** (Compliance Agent guardrail).
- **`theme-engine`** — dynamic, prompt-driven theme generation (luxury/modern/fashion/electronics/grocery/pharmacy/beauty/furniture/industrial/restaurant/automotive). **No fixed templates.**
- **Design Agent + SEO Agent** integrated into generation.
- **Begin Google OAuth verification submission** (4–8 wks for sensitive scopes) **now**, so P4 is not blocked. Create the AICOS company Google Business Profile (60-day clock for GBP API).

### Key deliverables
1. "Type a store name → get a complete, themed storefront" in minutes, populated by the P2 catalog.
2. Paste a competitor URL → derive a **distinct** design language (no asset/HTML copying) with a compliance check.
3. Theme switching/regeneration without code deploys.

### Milestones
- **M3.1 (wk 47):** Theme engine + design tokens generation.
- **M3.2 (wk 50):** Store builder homepage/category/policy generation from name.
- **M3.3 (wk 52):** Website cloning (visual inspiration) + compliance guardrails.
- **M3.4 (wk 53):** Submit Google OAuth verification + create AICOS GBP; **P3 exit review**.

### Rough ETA
**~10 weeks → target 2027-06-09.**

### Exit criteria
- A store can be generated end-to-end from a name, themed, and published (still behind human review).
- Cloning produces demonstrably original output and passes a copyright-safety review.
- Google OAuth verification submitted; AICOS GBP created and on the 60-day clock.

---

## P4 — Growth & Intelligence

**Goal:** Google ecosystem sync, AI marketing agent, AI customer-service agent, AI pricing agent, analytics & BI, AI inventory forecasting.

### Scope (modules: `google`, `marketing`, `customer-service`, `pricing`, `analytics`)
- **`google`** — **Merchant API v1 only** (Content API shuts down **2026-08-18** — hard deadline), prices in `amountMicros`, parallel async (no customBatch); GBP sync; **GA4 Measurement Protocol** server-side purchase events (API secret, no OAuth); Search Console sitemap auto-submit (XML sitemaps primary, not Indexing API); GTM one-click tag setup; **partial-grant (consent-unbundling) handling** with `granted_scopes[]` per tenant. AICOS as Merchant Center MCA with per-tenant sub-accounts. **Google Ads deferred to late P4/P5** (restricted scope + annual audit).
- **`marketing`** — Marketing Agent: Meta/TikTok/Pinterest/Google ad creative + copy + images; **human approval required**.
- **`customer-service`** — CS Agent trained on products/policies/inventory/shipping; chat/email; answer/return/ticket/track.
- **`pricing`** — Pricing Agent: discounts/promotions/dynamic pricing/bundles from competitor/demand/margin signals (recommendations gated by human approval).
- **`analytics`** — Analytics & BI dashboards + Analytics Agent insights; Inventory Agent forecasting (reorder points, dead stock, seasonal demand).

### Key deliverables
1. One-click Google sync: products → Merchant Center (v1), business → GBP, tracking → GA4 + GTM, sitemap → Search Console.
2. Marketing/CS/Pricing agents in production with human-approval gates.
3. BI dashboards + inventory forecasting recommendations.

### Milestones
- **M4.1 (wk 57):** Merchant API v1 + GBP sync (must precede 2026-08-18 cutoff dependency for new builds).
- **M4.2 (wk 61):** GA4 MP + Search Console sitemaps + GTM auto-setup.
- **M4.3 (wk 65):** Marketing Agent + CS Agent.
- **M4.4 (wk 69):** Pricing Agent + Analytics/BI + inventory forecasting; **P4 exit review**.

### Rough ETA
**~17 weeks → target 2027-10-06.**

### Exit criteria
- Products visible in Google Merchant Center via **Merchant API v1** (never Content API); GBP/GA4/GTM/Search Console wired with graceful partial-grant handling.
- All agent outputs (marketing/pricing) pass through human approval.
- BI dashboards live; inventory forecasting produces actionable reorder recommendations.

---

## P5 — Scale & Enterprise

**Goal:** Automation engine, multi-region, Kubernetes, white-label, compliance (GDPR/SOC2 path), advanced observability & security, cost governance.

### Scope (module: `automation` + platform hardening)
- **`automation`** — event/trigger/action workflow engine across modules and agents.
- **Kubernetes** prod: worker pods on **KEDA queue-depth autoscaling** (Redis list length, not CPU HPA); migrations as pre-deploy Job.
- **Multi-region + CDN**; R2 EU/US jurisdiction-locked storage for data residency; route EU tenants to EU region.
- **White-label / agency reseller** tenancy + theming + billing.
- **Compliance:** SOC 2 Type II path; audit logs migrated from PG RULE-based immutability to **S3 Object Lock WORM**; TIAs for US AI providers documented.
- **Cost governance:** per-tenant AI cost dashboards, budget caps, anomaly alerts; schema-per-tenant option for the largest enterprise tenants.
- **Advanced security:** key rotation automation, dispute/chargeback evidence workflow (Connect destination-charge liability), reserve requirements for high-risk categories.

### Key deliverables
1. Automation engine GA; KEDA autoscaling proven under load.
2. Multi-region with EU data residency; white-label tenant live.
3. SOC 2 readiness package; WORM audit logs; cost-governance dashboards.

### Milestones
- **M5.1 (wk 73):** Automation engine.
- **M5.2 (wk 77):** K8s + KEDA + multi-region/CDN.
- **M5.3 (wk 81):** White-label + cost governance.
- **M5.4 (wk 86):** SOC 2 path + WORM audit logs + advanced security; **P5 exit review / enterprise-ready**.

### Rough ETA
**~16 weeks → target 2028-01-26.**

### Exit criteria
- Workers autoscale on queue depth under load without missing the 15-minute launch SLA.
- EU tenant data demonstrably resident in-region; white-label reseller operates an isolated branded instance.
- SOC 2 Type II evidence collection running; audit logs immutable (WORM); per-tenant AI cost caps enforced.

---

## Cross-cutting invariants (every phase)

1. **Human gate before publish** — AI never auto-publishes (introduced P2, permanent).
2. **Tenant isolation at the database** — RLS FORCE + transaction-scoped `set_config`, `security_invoker` on all views, `@@index([tenantId])` + `@@index([tenantId, createdAt])` on every tenant model.
3. **AI usage is always metered** — every `ai-core` call emits `ai.usage`; billing deducts credits; AiCreditGuard + BullMQ limiter cap abuse.
4. **Provider-agnostic AI** — swap Claude/OpenAI/Gemini via config only.
5. **Workers are a separate NestJS app** (`apps/worker`) — independent scaling from `apps/api`.
6. **Dashboard stays current** — `project-dashboard.html` updated each milestone (per proposal).

## Critical external deadlines to respect

| Deadline | Item | Phase impacted |
|----------|------|----------------|
| **2026-08-18** | Google **Content API for Shopping shutdown** — build **Merchant API v1** only | P4 (`google`) |
| **Start of P3** | Submit **Google OAuth sensitive-scope verification** (4–8 wks) | P3 → unblocks P4 |
| **P3 start** | Create AICOS **GBP** (60-day age requirement for GBP API) | P4 (`google`) |
| **Ongoing** | Gemini model-version deprecations (4-month cycle) — pin model IDs + config fallback | P2 (`ai-core`) |
