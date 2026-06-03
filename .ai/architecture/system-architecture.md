# AICOS System Architecture

> Full system design: frontend apps, NestJS modular backend, workers, data stores, AI layer, request + video-processing flows, and deployment topology.
> Stack is locked (see SPEC + decision log). Phase 0 — this is the blueprint; no code yet.

---

## 1. Monorepo layout (pnpm)

```
aicos/  (pnpm monorepo — npm/yarn NOT used)
├── apps/
│   ├── web/        Next.js (App Router) — Storefront           :3000
│   ├── admin/      Next.js (App Router) — Owner Dashboard       :3100
│   ├── api/        NestJS modular monolith — HTTP API           :4000
│   └── worker/     NestJS — BullMQ consumers (FFmpeg, AI)       :4100
├── packages/
│   ├── ui/         shadcn/ui + Tailwind + Framer Motion design system
│   ├── config/     shared eslint/tsconfig/tailwind/env schema
│   ├── types/      shared TS types + Zod/JSON schemas (API contracts)
│   ├── ai-core/    AI provider abstraction + agent orchestration
│   └── shared/     tenant context, logging, errors, utils, event bus
├── prisma/         schema.prisma, migrations (run as K8s pre-deploy Job)
├── docker/         docker-compose.yml (infrastructure only)
└── .ai/            intelligence system (master-brain, architecture, research, decisions)
```

**`apps/worker` is a separate NestJS application**, not a module inside `apps/api` — this is required so FFmpeg/CPU-bound work scales independently of the HTTP tier.

---

## 2. C4-ish container diagram

```
                                ┌──────────────────────────────────────────────┐
                                │                  BROWSERS                      │
                                │   Store Owner          End Customer            │
                                └───────┬───────────────────────┬───────────────┘
                                        │                       │
                         ┌──────────────▼──────┐     ┌──────────▼───────────┐
                         │ apps/admin (Next.js) │     │ apps/web  (Next.js)  │
                         │ Dashboard      :3100 │     │ Storefront     :3000 │
                         └──────────┬───────────┘     └─────┬───────────┬────┘
                                    │ REST + JWT            │ REST+JWT  │ Meili tenant
                                    │                       │           │ token (read)
                                    ▼                       ▼           ▼
              ┌──────────────────────────────────────────────────┐  ┌──────────────┐
              │           apps/api  (NestJS)            :4000     │  │ Meilisearch  │
              │  ┌────────────────────────────────────────────┐  │  │  :7700       │
              │  │ Global: TenantContextMiddleware (RLS+ALS),  │  │  └──────▲───────┘
              │  │ RBAC Guard, Throttler, AiCreditGuard,       │  │         │ index sync
              │  │ rawBody webhook pipe, audit interceptor     │  │         │
              │  └────────────────────────────────────────────┘  │         │
              │  Domain modules ── AI orchestration modules       │─────────┘
              └───┬─────────────┬──────────────┬─────────────┬────┘
                  │ Prisma      │ enqueue       │ ai-core      │ S3 SDK
                  │ ($txn+RLS)  │ (BullMQ)      │ (gateway)    │
        ┌─────────▼───┐  ┌──────▼──────┐  ┌─────▼─────────┐  ┌─▼──────────────┐
        │ PostgreSQL  │  │   Redis     │  │  AI PROVIDERS │  │  Object Store  │
        │ 16+pgvector │  │ cache+queue │  │ Anthropic/    │  │ MinIO(dev)/    │
        │ +RLS  :5440 │  │     :6400   │  │ OpenAI/Gemini │  │ R2(prod)       │
        └─────▲───────┘  └──────┬──────┘  └───────▲───────┘  └───────▲────────┘
              │ Prisma          │ consume         │ via ai-core      │ frames/labels
              │ ($txn+RLS)      ▼                 │                  │
              │          ┌──────────────────────────────────────────────────┐
              └──────────│        apps/worker  (NestJS)        :4100         │
                         │  BullMQ consumers: ingest · keyframe(FFmpeg) ·    │
                         │  frame-analyze(ZXing+Gemini/Claude) · dedup       │
                         │  (pgvector) · merge · publish · sitemap · webhooks│
                         │  Scaled by KEDA on queue depth (not CPU/HPA)      │
                         └──────────────────────────────────────────────────┘

  External edges (behind adapters): Stripe (Billing+Connect) · Shippo/PostNord ·
  Google (Merchant v1/GBP/GA4/GSC/GTM/Maps) · Meta/TikTok/Pinterest/Google Ads · SMTP/SendGrid
```

---

## 3. Frontend apps

| App | Tech | Purpose | Notes |
|---|---|---|---|
| `apps/web` | Next.js App Router, Tailwind, shadcn/ui, Framer Motion | Customer storefront + onboarding/capture UX | Server BFF routes call `apps/api`; mobile capture enforces 1080p/20-min/blur+pace guidance; queries Meilisearch directly with a short-lived tenant token in the search hot path |
| `apps/admin` | Next.js App Router, shadcn/ui | Owner/manager control plane | Houses the **human verification review UI** (confidence-scored triage, merge/split, missing-price fill); catalog/order/inventory ops; billing & integrations |

**Auth in the browser:** access tokens kept in **memory** (never `localStorage`); refresh via httpOnly cookie. Themes (P3) injected as CSS variables/design tokens from `theme-engine`.

---

## 4. Backend — NestJS modular monolith (`apps/api`)

A single deployable that is internally modular (one NestJS module per SPEC module). This gives clean boundaries and a future microservice extraction path without premature distribution.

```
apps/api
├── main.ts                       # bootstrap: rawBody:true (Stripe HMAC), helmet, CSP+report-uri
├── common/
│   ├── tenant/                   # TenantContextMiddleware: JWT→tenantId, $txn set_config(TRUE), AsyncLocalStorage
│   ├── rbac/                     # roles guard (OWNER>MANAGER>STAFF; CUSTOMER; SUPER_ADMIN)
│   ├── throttler/                # NestJS Throttler (HTTP rate limit)
│   ├── ai-credit-guard/          # Redis per-tier credit balance guard
│   ├── audit/                    # append-only audit interceptor
│   └── prisma/                   # withTenant() wrapper — ONLY sanctioned DB entry path
├── modules/                      # P0/P1 domain
│   ├── iam/  billing/  catalog/  inventory/  orders/  payments/
│   ├── shipping/  customers/  storefront/  admin/  search/  media/  notifications/
│   ├── ai-core(bridge)/  ai-extraction/  content/                    # P2
│   ├── store-builder/  theme-engine/                                  # P3
│   └── google/  marketing/  customer-service/  pricing/  analytics/   # P4
│       └── automation/                                                # P5
└── each module = controller → service → repository(Prisma withTenant)
```

**Layering inside a module:** Controller (HTTP, DTO/Zod validation) → Service (business logic, enqueues jobs, calls `ai-core`) → Repository (`withTenant` Prisma). Services **never** call AI SDKs directly and **never** run heavy work inline.

---

## 5. Workers (`apps/worker`)

Separate NestJS app, separate K8s Deployment. Consumes BullMQ queues; uses the same Prisma/RLS/`withTenant` discipline and the same `ai-core` gateway as the API.

| Queue / Worker | Job | Concurrency | Notes |
|---|---|---|---|
| `video-ingest` | JOB1: validate, register `ExtractionJob`, fan-out | low | deterministic jobId `tenantId+s3ETag` |
| `keyframe` | JOB2: FFmpeg keyframe extract + pHash dedup → 60–100 frames | CPU-bound, isolate | enforce max resolution/length to avoid OOM |
| `frame-analyze` | JOB3: ZXing→OpenFoodFacts (free), then Gemini Flash batch-8, Claude fallback <0.6 | **10 concurrent** | hits sub-3-min latency target |
| `dedup` | JOB4: CLIP embeddings, pgvector cosine ≥0.92 cross-frame merge | medium | duplicates flagged for merge/split UI |
| `merge` | JOB5: assemble `ExtractedProductDraft` + per-field confidence | medium | feeds review queue |
| `publish` | JOB6: write catalog/inventory/media live, reindex Meili, submit sitemap | low | **triggered only by explicit user Publish** |
| `webhooks` | Stripe/Shippo/Google webhook side-effects | high | at-least-once; 5-min timestamp + event-ID dedup |
| `retention` | nightly GDPR retention enforcement | scheduled | part of worker, not api |

**Scaling:** KEDA scales worker pods on Redis list length (`bull:<queue>:wait`), **not** CPU HPA. BullMQ queue limiter `{ max: 10, duration: 60_000 }` caps AI burn globally.

---

## 6. Data & state stores

| Store | Role | Key design notes |
|---|---|---|
| **PostgreSQL 16 (+pgvector, RLS)** :5440 | System of record; CLIP embeddings for dedup | RLS `FORCE` on every tenant table; ≥16.9 (CVE fixes); composite `[tenantId]`/`[tenantId,createdAt]` indexes; PgBouncer transaction pooling |
| **Redis** :6400 | Cache + BullMQ broker + AiCreditGuard counters | append-only persistence; one instance backs cache & queues in dev |
| **Meilisearch** :7700 | Product search | tenant tokens (1h TTL, `tenant_id` filter); 10-word query limit handled in UI; sync from `catalog` on publish |
| **Object store (MinIO :9200 / R2 prod)** | Videos, frames, images, label cache | pre-signed multipart (10MB chunks); `temp/` 48h lifecycle; R2 $0 egress + EU/US jurisdiction lock in prod |

---

## 7. AI layer (`packages/ai-core`)

```
            calling module (e.g. ai-extraction, content, pricing)
                                  │  generate({task, schema, images?, tier})
                                  ▼
        ┌─────────────────────────────────────────────────────────┐
        │                 packages/ai-core                         │
        │  Router ─► provider select by task+cost+tier             │
        │     ├─ Gemini 2.5 Flash  (primary, vision first-pass)    │
        │     ├─ Claude Sonnet 4.6 (fallback <0.6 conf / 429)      │
        │     └─ OpenAI GPT-4.1    (alt)                            │
        │  JSON-schema validation · regex price validation ·       │
        │  rate-limit tracking + exponential backoff ·             │
        │  model IDs pinned w/ config fallback ·                   │
        │  emits  ai.usage {provider, model, tokens, costCents}    │
        └───────────────┬──────────────────────────┬──────────────┘
                        │ ai.usage event            │ model HTTP call
                        ▼                            ▼
                  billing (deduct credits)     external AI provider
```

The `ai.usage` event is the seam that makes AI cost trackable and billable; without it cost governance (P5 principle) is impossible. The 12 AI agents (Extraction, Product, Design, SEO, Content, Marketing, Inventory, Pricing, Customer Service, Analytics, Google, Compliance) are orchestrations built **on top of** this gateway, not separate provider integrations.

---

## 8. Request flow — synchronous shopper purchase

```
Shopper → apps/web → [Next BFF] → POST /payments/checkout (apps/api)
  api: JWT verify → TenantContextMiddleware (txn + set_config TRUE) → RBAC(CUSTOMER)
     → payments.service: create Stripe Checkout Session
        (embedded; automatic_tax; transfer_data.destination=tenant ConnectAcct;
         on_behalf_of; application_fee_amount=AICOS fee; promo codes)
     → returns client secret  →  Stripe handles SCA/3DS
  Stripe → POST /payments/webhooks/stripe (rawBody, HMAC verify, 5-min window, event-id dedup)
     → enqueue 'webhooks' job → 200 in <5s
  worker: order.paid → inventory decrement (reservation→committed)
     → shipping: Shippo rate+label (cache labelUrl to S3) → notifications: email
     → GA4 Measurement Protocol purchase event → analytics event
```

---

## 9. Video-processing flow — the flagship (asynchronous, idempotent)

```
Owner films shelves (apps/web, 1080p, ≤20min, blur/pace guidance)
   │  request pre-signed multipart URLs (media) → upload DIRECT to R2 temp/ (10MB chunks)
   ▼
POST /extraction/jobs (ai-extraction) → enqueue 'video-ingest' (jobId=tenantId+s3ETag)
   ▼  apps/worker pipeline (each stage deterministic jobId → BullMQ dedup = idempotent):
JOB1 ingest ─► JOB2 keyframe (FFmpeg + pHash → 60–100 frames to temp/)
   ▼
JOB3 frame-analyze ×10 concurrent:
      ① ZXing barcode → Open Food Facts (auto-fill 20–40%, $0 LLM)
      ② Gemini 2.5 Flash, 8 frames/call → draft fields + per-field confidence
      ③ Claude Sonnet 4.6 fallback when confidence <0.6 or Gemini 429
   ▼
JOB4 dedup (CLIP embeddings → pgvector cosine ≥0.92 cross-frame merge)
   ▼
JOB5 merge → ExtractedProductDraft[] (+ FieldConfidence; missing-price flags)
   ▼  content: AI descriptions + SEO (DOMPurify-sanitized)
   ▼
★ HUMAN VERIFICATION GATE — admin review UI (confidence triage, merge/split, fill prices) ★
   ▼  (explicit "Publish" click — NEVER automatic)
JOB6 publish → catalog + inventory + media live → Meili reindex → GSC sitemap submit
   ▼
Storefront live.  Total target: < 15 minutes.  AI cost ≈ $0.10–$0.15/video. Latency 75–110s @10 workers.
```

**Failure modes & guards:** motion blur (Laplacian variance + capture guidance) · hallucination (JSON-schema + price regex + cross-frame agreement + the human gate) · occluded prices (surfaced for manual entry) · large video (20-min cap, credits ∝ length) · duplicate packaging (explicit merge/split action).

---

## 10. Deployment topology

### Local (Phase 0/1 — dev)
- **Infra in Docker Compose only** (`docker/docker-compose.yml`): Postgres, Redis, Meilisearch, MinIO, Mailhog. Ports locked in `.ai/config/project-ports.json` (remapped because the dev machine already runs these on defaults).
- **Apps run on host via pnpm** (`web` 3000, `admin` 3100, `api` 4000, `worker` 4100) for a fast dev loop.
- Secrets via **Doppler** (same as prod — zero code change). trufflehog pre-commit.

### Production (Kubernetes-ready, P5)
```
            ┌──────────── CDN / Cloudflare ────────────┐
            │  apps/web (SSR)        apps/admin (SSR)   │
            └───────────────────┬──────────────────────┘
                                │ Ingress (TLS, CSP+report-uri)
                  ┌─────────────▼───────────────┐
                  │  apps/api  Deployment (HPA)  │
                  └──────┬───────────────┬───────┘
                         │ PgBouncer(txn) │ Redis
            ┌────────────▼──────┐   ┌─────▼─────────────────────────┐
            │ PostgreSQL 16     │   │ apps/worker Deployment        │
            │ (managed, multi-  │   │ scaled by KEDA on queue depth │
            │  region, ≥16.9)   │   └───────────────────────────────┘
            └───────────────────┘
   Object store: Cloudflare R2 (EU/US jurisdiction-locked).  Search: Meilisearch (self-host).
   Migrations: K8s pre-deploy Job (never in-process).  Multi-region + white-label: P5.
```

**Hard deployment rules:** Prisma migrations run as a **pre-deploy Job** (in-process migration races multiple pods); PgBouncer in **transaction pooling** mode; `worker` and `api` are **separate** deployments; KEDA (not CPU HPA) for queue consumers; EU tenant data region-locked from day one.

---

## 11. Cross-cutting concerns (applied globally)
- **Observability:** structured logs with `tenantId`/`jobId` from `AsyncLocalStorage`; metrics on queue depth, AI cost per tenant, extraction latency/accuracy; tracing across api→worker.
- **Security:** SAQ A via Stripe; CSP+`report-uri` (PCI 11.6.1); RS256 JWT (90-day rotation); bcrypt 12; DOMPurify on AI HTML; secrets in Doppler.
- **Idempotency:** deterministic BullMQ job IDs; webhook timestamp+event-id dedup.
- **Cost governance:** AiCreditGuard + BullMQ limiter + Throttler; R2 $0 egress; `temp/` 48h lifecycle.
