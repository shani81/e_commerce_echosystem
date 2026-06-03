# AICOS — Risk Register

> Living register of technical, security, business, scalability, vendor, and compliance risks for AICOS. Maintained from PHASE 0 onward.
> Last updated: 2026-06-03. Scoring: **Severity** = impact if it materializes; **Probability** = likelihood given current plan; both Low/Medium/High/Critical.
> Owner roles: PL = Program/Delivery Lead, BE = Backend, AI = AI/ML, SEC = Security, FE = Frontend, OPS = DevOps.

## Heatmap summary (count by severity)

| Severity | Open risks |
|----------|-----------|
| Critical | 6 |
| High | 9 |
| Medium | 8 |
| Low | 2 |

---

## 1. Security & Tenant Isolation

### R-SEC-01 — Cross-tenant data leakage via RLS / connection-pool misconfiguration
- **Category:** Security · **Severity:** Critical · **Probability:** Medium (High if not explicitly enforced)
- **Impact:** One tenant reads/writes another tenant's catalog, orders, customers, prices. Catastrophic trust and legal failure; potential GDPR breach.
- **Mitigation:** FORCE ROW LEVEL SECURITY on every tenant table; `set_config(..., TRUE)` (transaction-local) only, inside Prisma `$transaction`; PgBouncer in **transaction pooling** with `SET LOCAL`; mandatory `withTenant` wrapper as the only DB path; automated cross-tenant isolation test in CI; code review checklist item. Owner: SEC/BE.

### R-SEC-02 — RLS bypass via superuser-owned VIEW / SECURITY DEFINER function
- **Category:** Security · **Severity:** Critical · **Probability:** Medium
- **Impact:** A view created by the migration role without `security_invoker=true` silently bypasses all RLS — invisible cross-tenant exposure.
- **Mitigation:** `ALTER VIEW ... SET (security_invoker = true)` on every view; lint/migration check that fails CI on any view lacking the flag; avoid SECURITY DEFINER unless audited. Owner: BE/SEC.

### R-SEC-03 — Active PostgreSQL RLS CVEs (CVE-2024-10978, CVE-2025-8713)
- **Category:** Security/Vendor · **Severity:** Critical · **Probability:** High if version not pinned
- **Impact:** Optimizer statistics can leak row data from RLS-protected tables on PG < 16.9.
- **Mitigation:** Pin PostgreSQL **≥ 16.9** in Docker/K8s from P0; renovate/dependabot alerts on PG image; document minimum version. Owner: OPS.

### R-SEC-04 — Meilisearch master-key exposure on frontend
- **Category:** Security · **Severity:** High · **Probability:** Medium
- **Impact:** If the master key (not tenant token) reaches the storefront, any tenant can craft filters to read other tenants' products/prices.
- **Mitigation:** Storefront uses **tenant tokens** only (`generateTenantToken`, embedded `tenant_id` filter, 1-hour TTL); master key server-side only; test asserting no master key in client bundle. Owner: BE/FE.

### R-SEC-05 — JWT stored in localStorage → XSS session theft
- **Category:** Security · **Severity:** High · **Probability:** Medium (raised by AI-generated content surfaces)
- **Impact:** XSS (including via AI-generated catalog HTML) exfiltrates all sessions.
- **Mitigation:** Access token in memory only; refresh token httpOnly cookie; **DOMPurify** on all AI-generated HTML (P2 prerequisite); strict CSP; lint rule banning token writes to localStorage. Owner: FE/SEC.

### R-SEC-06 — Stripe webhook raw-body corruption / replay
- **Category:** Security · **Severity:** High · **Probability:** Medium
- **Impact:** JSON middleware before the webhook route silently breaks HMAC verification forever; replayed webhooks double-fulfill orders.
- **Mitigation:** `rawBody: true` at NestJS bootstrap; webhook route excluded from body parsers; 5-minute timestamp window + event-ID dedupe; process via BullMQ (return 200 < 5 s, work async). Owner: BE.

### R-SEC-07 — Audit-log immutability insufficient for SOC 2
- **Category:** Security/Compliance · **Severity:** Medium · **Probability:** Medium
- **Impact:** PG RULE-based immutability is adequate P0–P3 but not for SOC 2 Type II evidence.
- **Mitigation:** Plan migration to **S3 Object Lock WORM** in P5 before pursuing certification; design log schema now to be WORM-friendly. Owner: SEC/OPS.

---

## 2. AI Extraction (Flagship) — Technical & Cost

### R-AI-01 — AI cost bomb from abuse / trial farming
- **Category:** Security/Business · **Severity:** Critical · **Probability:** High without controls
- **Impact:** A single compromised/trial-abuse account can generate $5,000+ in AI API charges within an hour before alerting fires.
- **Mitigation:** Treat as **P1 billing infrastructure**, not optional rate-limiting: Redis **AiCreditGuard** per tier, **BullMQ queue limiter** (`max`/`duration`), NestJS Throttler, pre-signed upload URLs, per-tenant budget caps + anomaly alerts. Free tier capped (1 extraction / ≤20 products). Owner: BE/AI/SEC.

### R-AI-02 — Extraction accuracy errors (hallucinated prices, missed SKUs, wrong variants)
- **Category:** Technical/Business · **Severity:** High · **Probability:** High (near-certain early)
- **Impact:** Wrong prices/products in a live store; lost trust; financial harm to the merchant.
- **Mitigation:** **Mandatory human verification gate** (never auto-publish); per-field confidence scores driving review triage; JSON-schema validation; price-format regex; cross-frame agreement checks. Market the gate as a feature. Owner: AI/PL.

### R-AI-03 — Motion blur / occluded price tags degrade OCR
- **Category:** Technical · **Severity:** High · **Probability:** High (~40% blur, ~30% occluded tags)
- **Impact:** OCR accuracy drops 90–95% → 60–75%; many products missing prices.
- **Mitigation:** Laplacian-variance blur detection + real-time filming guidance (pace/blur warnings); 1080p minimum enforced at upload; clearly surface missing-price items in review; **photo-batch fallback** path. Owner: AI/FE.

### R-AI-04 — Cross-frame product deduplication errors
- **Category:** Technical · **Severity:** Medium · **Probability:** Medium
- **Impact:** Same product appears multiple times, or two sizes merged into one.
- **Mitigation:** pgvector CLIP embeddings (cosine ≥ 0.92); explicit **merge/split** action in review UI; surface near-duplicates for human decision. Owner: AI.

### R-AI-05 — Wrong products published to the wrong store
- **Category:** Technical/Security · **Severity:** Critical · **Probability:** Low (with gate) / Critical impact
- **Mitigation:** Deterministic, tenant-scoped job IDs (`tenantId + s3ETag + segmentIndex`); RLS on all extraction tables; human gate as primary control; test asserting publish requires explicit user action. Owner: AI/BE.

---

## 3. Vendor & External Dependencies

### R-VEN-01 — Google Content API for Shopping shutdown (hard deadline 2026-08-18)
- **Category:** Vendor · **Severity:** High · **Probability:** High if not pre-empted
- **Impact:** Build against the wrong API → lose product-feed visibility for all tenants on the cutoff date; no extensions.
- **Mitigation:** Build **Merchant API v1 only** from day one of `google` work; `amountMicros` prices; parallel async (no customBatch); complete well before 2026-08-18. Owner: BE.

### R-VEN-02 — Google OAuth verification delay blocks P4 launch
- **Category:** Vendor · **Severity:** High · **Probability:** Medium
- **Impact:** Sensitive-scope verification takes 4–8 wks (longer if rejected); late submission blocks GBP/GA4/GSC/GTM features; unverified apps expire refresh tokens every 7 days.
- **Mitigation:** **Submit verification at start of P3**, not P4; create AICOS GBP immediately (60-day age requirement); add up to 100 beta testers as test users to bypass warnings/7-day expiry during the window; provide a detailed demo video. Owner: PL/BE.

### R-VEN-03 — Google Ads restricted scope (audit + developer token)
- **Category:** Vendor/Compliance · **Severity:** Medium · **Probability:** Medium
- **Impact:** Annual third-party security audit ($5k–$30k/yr) + developer-token approval; heavy ongoing cost.
- **Mitigation:** Defer Google Ads to late P4/P5; budget the recurring audit; gate behind a feature flag until approved. Owner: PL.

### R-VEN-04 — AI model deprecation (e.g., Gemini ~4-month cycle)
- **Category:** Vendor/Technical · **Severity:** Medium · **Probability:** High
- **Impact:** A pinned model is shut down (Gemini 2.0 Flash deprecated Feb 2026, off June 2026); extraction breaks.
- **Mitigation:** Provider abstraction (`ai-core`) allows model-version change with no code change; **pin model ID + config fallback ID**; monitor deprecation notices; auto-fallback chain. Owner: AI.

### R-VEN-05 — AI provider outage / rate limits at scale
- **Category:** Vendor · **Severity:** High · **Probability:** Medium
- **Impact:** Single-provider outage or 429s at Pro volume stalls extraction; 15-min SLA missed.
- **Mitigation:** Multi-provider fallback chain (Gemini → Claude → OpenAI); per-provider rate-limit tracking in BullMQ; exponential backoff; auto-fallback on 429. Owner: AI/BE.

### R-VEN-06 — Stripe Connect destination-charge chargeback/refund liability on platform
- **Category:** Vendor/Business · **Severity:** High · **Probability:** Medium
- **Impact:** Chargebacks and destination-charge refunds debit the **platform** account, not the tenant; without reserves AICOS bleeds cash; without a dispute workflow, no recourse.
- **Mitigation:** Build dispute-evidence workflow before Go Live; per-tenant reserve requirements for high-risk categories (electronics/luxury); maintain Stripe balance/credit line for refunds. Owner: BE/PL.

### R-VEN-07 — Shippo carrier coverage / cost crossover
- **Category:** Vendor · **Severity:** Low · **Probability:** Medium
- **Impact:** Shippo ($0.07/label) becomes pricier than EasyPost above ~50k labels/month; EasyPost lacks Bring/PostNord.
- **Mitigation:** `ShippingProvider` interface from P1; Shippo default (Bring/PostNord coverage); PostNord direct API in P2; plan EasyPost BYOCA / Shippo Premier migration before the volume threshold. Owner: BE.

### R-VEN-08 — Stripe API version drift (polymorphic coupon, Accounts v2 maturity)
- **Category:** Vendor · **Severity:** Medium · **Probability:** Medium
- **Impact:** Sept-2025 'clover' made PromotionCode.coupon polymorphic — hardcoded fields break; Accounts v2 (Dec 2025) SDK/docs may lag.
- **Mitigation:** Pin API version in SDK config; test against the pinned version; handle polymorphic coupon field; integration tests on Accounts v2 onboarding. Owner: BE.

---

## 4. Competitive & Business

### R-BIZ-01 — Incumbent copies video-to-catalog extraction (Shopify Sidekick / Google Lens)
- **Category:** Business · **Severity:** High · **Probability:** Medium (12–24 mo)
- **Impact:** Loss of the primary differentiator if a giant ships scan-to-list.
- **Mitigation:** Execute fast; build **data network effects** from extraction-accuracy feedback; differentiate as a **complete operational store**, not a product feed; deepen the full commerce-OS moat. Owner: PL.

### R-BIZ-02 — Pricing/free-tier mismatch blocks adoption
- **Category:** Business · **Severity:** Medium · **Probability:** Medium
- **Impact:** Non-technical persona won't pay before seeing results; priced above Shopify Basic equivalent removes the switching incentive.
- **Mitigation:** Starter ≤ $29/mo; meaningful **free tier (1 extraction / ≤20 products)**; extraction credits proportional to video length. Owner: PL.

### R-BIZ-03 — Owner reluctance to film (privacy / unfamiliarity)
- **Category:** Business · **Severity:** Medium · **Probability:** Medium
- **Impact:** Target users won't record video (sensitive pricing, competitor visibility, unfamiliarity) → flagship unused.
- **Mitigation:** **Photo-batch fallback** at launch; clear privacy messaging; in-app filming guidance to lower friction. Owner: PL/FE.

### R-BIZ-04 — Localization/currency gaps vs incumbents early on
- **Category:** Business · **Severity:** Medium · **Probability:** Medium
- **Impact:** Multi-currency/multi-language gaps disadvantage AICOS vs established players in early phases.
- **Mitigation:** English-first launch; top-5 language i18n scaffolding in P2/P3; Meilisearch multilingual indexing; Stripe multi-currency. Owner: FE/PL.

---

## 5. Scalability & Operations

### R-SCALE-01 — BullMQ worker starvation under high video load
- **Category:** Scalability · **Severity:** High · **Probability:** Medium without KEDA
- **Impact:** Extraction queue backs up; 15-minute store-launch SLA missed across tenants.
- **Mitigation:** **KEDA queue-depth autoscaling** (Redis list length, not CPU HPA) on worker pods; separate `apps/worker` deployment; 10 concurrent FrameAnalysisWorkers; fan-out architecture. Owner: OPS/BE.

### R-SCALE-02 — FFmpeg OOM on 4K / very long video
- **Category:** Scalability · **Severity:** Medium · **Probability:** Medium
- **Impact:** Worker pod OOMKilled mid-job.
- **Mitigation:** Enforce max resolution + file size + **20-minute** length at upload; validate before processing; per-job memory limits. Owner: BE/OPS.

### R-SCALE-03 — Missing composite tenant indexes → full table scans
- **Category:** Scalability · **Severity:** Medium · **Probability:** Medium
- **Impact:** Paginated tenant queries under RLS do full scans without `@@index([tenantId, createdAt])`.
- **Mitigation:** Require both `@@index([tenantId])` and `@@index([tenantId, createdAt])` on every tenant model; schema review checklist. Owner: BE.

### R-SCALE-04 — Migrations run in-process cause multi-pod race
- **Category:** Scalability/Ops · **Severity:** Medium · **Probability:** Low (with rule)
- **Impact:** Concurrent pod startup races Prisma migrations.
- **Mitigation:** Migrations as a Kubernetes **pre-deploy Job**, never in NestJS startup. Owner: OPS.

### R-SCALE-05 — `temp/` storage fills from FFmpeg frames
- **Category:** Ops · **Severity:** Low · **Probability:** Medium
- **Impact:** 300+ JPEGs per 5-min video accumulate and fill storage.
- **Mitigation:** `temp/` R2 prefix with **48-hour lifecycle expiry**. Owner: OPS.

---

## 6. Compliance & Privacy

### R-COMP-01 — GDPR dual-role obligations (controller + processor) unmet
- **Category:** Compliance · **Severity:** High · **Probability:** Medium
- **Impact:** Operating EU tenants without DPAs, DSAR endpoints, or retention enforcement risks fines up to €20M / 4% revenue.
- **Mitigation:** Build DSAR export + erasure endpoints in **P1** before any EU customer; nightly BullMQ retention job; DPA template per tenant; route EU tenant data to EU region (R2 EU lock) from day one. Owner: SEC/PL.

### R-COMP-02 — Schrems II / TIA exposure on US AI provider calls
- **Category:** Compliance · **Severity:** Medium · **Probability:** Medium
- **Impact:** AI calls to Anthropic/OpenAI/Google are international transfers needing SCCs **and** Transfer Impact Assessments; SCC alone insufficient.
- **Mitigation:** Document TIAs for each US AI provider in P5 (earlier if EU tenants onboard sooner); minimize PII in prompts; data-residency routing. Owner: SEC.

### R-COMP-03 — PCI DSS v4.0 Req 11.6.1 tamper detection on payment pages
- **Category:** Compliance · **Severity:** Medium · **Probability:** Medium
- **Impact:** Any third-party script on a payment page without CSP enforcement is now a PCI violation.
- **Mitigation:** Stripe Checkout/Elements to stay at SAQ A; CSP with Stripe directives + **report-uri** + SRI to satisfy 11.6.1. Owner: SEC/FE.

### R-COMP-04 — Website-cloning copyright infringement (P3)
- **Category:** Compliance/Legal · **Severity:** Medium · **Probability:** Low
- **Impact:** Cloning a competitor site could copy copyrighted assets/HTML.
- **Mitigation:** Generate **original** implementations from visual inspiration only; never copy HTML or assets; Compliance Agent guardrail + review. Owner: AI/PL.
