# AICOS Platform Principles

> Non-negotiable principles that govern every design and code decision in AICOS.
> When a trade-off is unclear, these win. They are ordered by precedence: a higher-numbered principle never overrides a lower-numbered one.

---

## P1 — Tenant isolation is sacred
Cross-tenant data leakage is the worst possible failure. Every tenant table has `tenant_id NOT NULL` + `FORCE ROW LEVEL SECURITY`; tenant context is set transaction-locally (`set_config(..., TRUE)` inside `$transaction`) with PgBouncer in transaction-pooling mode; all views use `security_invoker=true`; PostgreSQL is pinned ≥ 16.9. The `withTenant` wrapper is the **only** sanctioned DB entry path. RBAC guards sit above the data layer and RLS sits below it — **defense in depth**, so a broken guard still cannot return another tenant's rows.

## P2 — Nothing AI-generated publishes automatically
A **human verification gate** sits between every AI output and any customer-visible surface. The catalog-publish job is triggered **only by explicit user action**, never automatically after extraction/merge completes. This is an architectural gate, not a UX nicety — it is the platform's primary defense against hallucinated prices, missed SKUs, and wrong-store publishing, and it is our headline trust differentiator versus Shopify Magic / Wix Harmony.

## P3 — The 15-minute north star is the product
Every decision is judged against: _"does a non-technical owner go from filming shelves to a live store in under 15 minutes?"_ Friction is the enemy, not cost. This drives mobile capture quality gates (1080p min, 20-min max, blur/pace guidance), the sub-3-minute extraction latency target, confidence-scored review triage, and zero-config defaults everywhere. A free tier (1 extraction, ≤20 products) and a photo-batch fallback are mandatory because the target persona will not pay before seeing results.

## P4 — Provider-agnostic AI through one gateway
No module ever imports an AI provider SDK directly. **All** model calls flow through `packages/ai-core`, which routes/falls back across Anthropic (default), OpenAI, and Gemini, validates JSON-schema outputs, handles rate-limit/backoff, pins model IDs with config fallbacks, and emits `ai.usage` events. Swapping providers or model versions must require **zero code change** in calling modules — Gemini's 4-month deprecation cycles make this a survival requirement, not a luxury.

## P5 — AI cost is governed like money, because it is
AI spend is revenue-protecting infrastructure. A single compromised or abusive account can burn thousands of dollars per hour. Enforce limits at **three layers**: NestJS Throttler (HTTP), Redis-backed `AiCreditGuard` (per-tier credit balance), and BullMQ queue limiter (`{ max: 10, duration: 60_000 }`). Every `ai.usage` event deducts credits; extraction credits scale with video length. No AI endpoint ships without all three guards.

## P6 — Heavy work is asynchronous and idempotent
The API never runs anything > ~1s or CPU-bound inline. FFmpeg, multi-frame vision, dedup, sitemap rebuilds, webhook side-effects → **BullMQ jobs** consumed by `apps/worker` (a separate NestJS app / separate K8s deployment, scaled by **KEDA on queue depth**, not CPU). Jobs use **deterministic IDs** (`tenantId + s3ETag + segmentIndex`) for native BullMQ dedup/idempotency. Webhooks return HTTP 200 within 5s and process asynchronously, with timestamp (5-min window) + event-ID dedup to defeat replay.

## P7 — Storage and search are abstracted and cost-aware
Object storage is S3-compatible behind one adapter: MinIO (dev) ↔ Cloudflare R2 (prod, $0 egress, EU/US jurisdiction lock). The `temp/` prefix has a 48h lifecycle rule (frames accumulate fast). Search is Meilisearch with **per-tenant tokens (1h TTL)** queried directly from the frontend — the master key never reaches the browser. Same SDK/code path local and prod; same isolation guarantee everywhere.

## P8 — Security and compliance are built in, not bolted on
Stripe Elements/Checkout keeps AICOS at **SAQ A**; a CSP with `report-uri` satisfies PCI DSS v4.0 §11.6.1 tamper detection. `rawBody:true` at NestJS bootstrap protects webhook HMAC. GDPR dual-role is explicit (controller of tenants, processor of shoppers): DSARs ship in P1, SCCs + Transfer Impact Assessments cover every US AI provider call, EU tenant data is region-locked from day one. Secrets live in Doppler (dev→prod, zero code change) with trufflehog pre-commit. JWTs (RS256, 90-day rotation) live in memory, never `localStorage`. AI-generated HTML is DOMPurify-sanitized before it touches the catalog.

## P9 — General e-commerce, never restaurant-specific
AICOS is a **general** commerce OS for any physical store — grocery, fashion, electronics, pharmacy, beauty, furniture. The baseline's restaurant examples are illustrative only; the proposal controls business scope. Catalog, extraction, content, and UI must generalize across verticals; no vertical-specific assumption is baked into core data models.

## P10 — Knowledge is never lost; reuse before create
The `.ai/` intelligence system is the source of truth: Master Brain (this directory), research digests, decision log, module/integration registries, and the live `project-dashboard.html`. Search before generating; reuse modules/packages before creating new ones; record every meaningful decision in the decision log and durable learnings in project memory. Names, modules, and phases stay **exactly** consistent with the SPEC.

## P11 — Plan → design → estimate → implement
We analyze, research, plan, design, and estimate **before** writing code (Phase 0 is planning only). Implementation is gated on an explicit go decision. Migrations run as a Kubernetes pre-deploy Job (never in-process at app startup — race condition with multiple pods). Kubernetes-readiness and multi-region are designed for from day one even though they land in P5.

---

### Conflict-resolution rule
On a **business-scope** conflict, `PROJECT_PROPOSAL.md` wins. On a **technical** conflict, `CLAUDE_CODE_BASELINE.md` wins. When two principles above appear to conflict, the **lower-numbered** principle takes precedence (isolation and the human gate are never traded away for speed or cost).
