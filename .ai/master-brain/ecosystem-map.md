# AICOS Ecosystem Map

> **Product:** AI Commerce OS (AICOS) — _"Film your shelves. Publish your store. In minutes."_
> **Phase:** P0 (Planning). Every module below is **Planned / 0%**. This map is the canonical mental model of the platform's boundaries.
> **North Star:** A non-technical physical-store owner films their shelves → AI extracts the full catalog → human review → Publish → a complete operational online store goes live in **under 15 minutes**.

---

## 1. Bird's-eye ecosystem tree

```
                                  ┌───────────────────────────────────────────────────┐
                                  │                    A I C O S                       │
                                  │        AI Commerce OS — multi-tenant SaaS          │
                                  └───────────────────────────────────────────────────┘
                                                       │
        ┌──────────────────────────────┬───────────────┴───────────────┬──────────────────────────────┐
        ▼                              ▼                               ▼                              ▼
┌───────────────┐            ┌───────────────────┐          ┌────────────────────┐         ┌────────────────────┐
│  EXPERIENCE   │            │   COMMERCE CORE   │          │   AI INTELLIGENCE  │         │   PLATFORM / OPS   │
│  (apps/web,   │            │   (apps/api       │          │   (packages/       │         │  (cross-cutting,   │
│   apps/admin) │            │    domain modules)│          │    ai-core +       │         │   infra, tenancy)  │
│               │            │                   │          │    agent modules)  │         │                    │
└───────┬───────┘            └─────────┬─────────┘          └─────────┬──────────┘         └─────────┬──────────┘
        │                              │                              │                              │
        ▼                              ▼                              ▼                              ▼
  storefront  (P1)             catalog       (P1)            ai-core         (P2)          iam            (P0)
  admin       (P1)             inventory     (P1)            ai-extraction   (P2)★FLAGSHIP  billing        (P0)
  storefront  themes(P3)       orders        (P1)            content         (P2)          media          (P1)
  store-builder(P3)            payments      (P1)            store-builder   (P3)          notifications  (P1)
  theme-engine (P3)            shipping      (P1)            theme-engine    (P3)          search         (P1)
                               customers     (P1)            marketing       (P4)          google         (P4)
                                                             customer-service(P4)          analytics      (P4)
                                                             pricing         (P4)          automation     (P5)
```

`★` = flagship, category-defining module (the only uncontested capability in the market).

---

## 2. Layered boundary view (who may call whom)

Boundaries are **directional**: an arrow `A → B` means "A may depend on B". Reverse calls are forbidden.
The **golden rule**: dependencies always point *downward*; lower layers never import from higher layers.

```
╔══════════════════════════════════════════════════════════════════════════════════════════╗
║  LAYER 0 — EXPERIENCE (Next.js App Router)                                                 ║
║  ┌────────────────────┐  ┌────────────────────┐                                            ║
║  │ apps/web           │  │ apps/admin         │   (browser; talks ONLY to api + Meili-     ║
║  │ Storefront (3000)  │  │ Dashboard (3100)   │    search tenant token; never to DB)       ║
║  └─────────┬──────────┘  └─────────┬──────────┘                                            ║
╚════════════╪═══════════════════════╪═══════════════════════════════════════════════════════╝
             │  HTTPS / REST + tenant JWT                  │ Meilisearch tenant token (read)
             ▼                                              ▼
╔══════════════════════════════════════════════════════════════════════════════════════════╗
║  LAYER 1 — APPLICATION / API (apps/api — NestJS modular monolith)                          ║
║  ┌──────────────────────────────── DOMAIN MODULES ──────────────────────────────────────┐ ║
║  │ catalog · inventory · orders · payments · shipping · customers · storefront(BFF) ·    │ ║
║  │ admin(BFF) · search · media · notifications · analytics · automation                  │ ║
║  └───────────────────────────────────────────────────────────────────────────────────────┘ ║
║  ┌──────────────────────────── AI ORCHESTRATION MODULES ────────────────────────────────┐ ║
║  │ ai-extraction(★) · content · store-builder · theme-engine · marketing ·              │ ║
║  │ customer-service · pricing · google                                                   │ ║
║  └───────────────────────────────────────────────────────────────────────────────────────┘ ║
╚════════════╪═══════════════════════╪═══════════════════════╪══════════════════════════════╝
             │ enqueue jobs           │ AI calls               │ platform services
             ▼                        ▼                        ▼
╔══════════════════════════╗ ╔════════════════════════╗ ╔══════════════════════════════════╗
║ LAYER 2 — WORKERS        ║ ║ LAYER 2 — AI CORE      ║ ║ LAYER 2 — PLATFORM (cross-cut)   ║
║ apps/worker (NestJS)     ║ ║ packages/ai-core       ║ ║ iam · billing · packages/shared  ║
║ BullMQ consumers:        ║ ║ provider abstraction   ║ ║ tenant context · RLS · RBAC ·    ║
║ FFmpeg · frame analysis  ║ ║ (Claude/OpenAI/Gemini) ║ ║ audit · credit guard             ║
║ dedup · merge · publish  ║ ║ usage metering events  ║ ║                                  ║
╚════════════╪═════════════╝ ╚═══════════╪════════════╝ ╚════════════════╪═════════════════╝
             │                            │                               │
             ▼                            ▼                               ▼
╔══════════════════════════════════════════════════════════════════════════════════════════╗
║  LAYER 3 — DATA & STATE                                                                    ║
║  PostgreSQL 16 (+ pgvector, RLS)  ·  Redis (cache + BullMQ)  ·  Meilisearch  ·             ║
║  S3-compatible object store (MinIO dev / Cloudflare R2 prod)                               ║
╚══════════════════════════════════════════════════════════════════════════════════════════╝
             │
             ▼
╔══════════════════════════════════════════════════════════════════════════════════════════╗
║  LAYER 4 — EXTERNAL INTEGRATIONS (behind adapters in packages/* and module providers)     ║
║  AI: OpenAI · Anthropic · Gemini   │  Money: Stripe (Billing + Connect)                    ║
║  Shipping: Shippo → PostNord/Bring │  Google: GBP · Merchant API v1 · GA4 · GSC · GTM · Maps║
║  Ads: Meta · TikTok · Pinterest · Google Ads   │  Email: SMTP/SendGrid (Mailhog dev)       ║
╚══════════════════════════════════════════════════════════════════════════════════════════╝
```

### Boundary rules (non-negotiable)
1. **Browser never touches the database.** Layer 0 reaches data only through Layer 1 (API) — the single exception is the storefront querying **Meilisearch directly with a short-lived per-tenant token** for the search hot path.
2. **API never runs heavy/long work inline.** Anything > ~1s or CPU-bound (FFmpeg, multi-frame AI, sitemap rebuilds) is **enqueued to BullMQ** and consumed by `apps/worker`.
3. **No module calls an AI provider SDK directly.** All model calls flow through `packages/ai-core`, which emits `ai.usage` events that `billing` consumes for credit deduction.
4. **Every domain module is tenant-scoped.** No module may read/write a row without a tenant context set (Postgres RLS + `AsyncLocalStorage`).
5. **Nothing AI-generated auto-publishes.** A human verification gate sits between every AI output and any customer-visible surface (the publish job is triggered only by explicit user action).

---

## 3. Phase delivery overlay

```
P0 Foundation ──► P1 Core Commerce MVP ──► P2 The Magic (AI) ──► P3 Store Builder ──► P4 Growth & Intelligence ──► P5 Scale & Enterprise
─────────────     ────────────────────     ─────────────────     ─────────────────    ──────────────────────────    ─────────────────────
iam               catalog                   ai-core               store-builder        google                        automation
billing           inventory                 ai-extraction ★       theme-engine         marketing                     (multi-region,
(design system,   orders                    content                                    customer-service               K8s, white-label,
 CI/CD, observ.)  payments                  (human verify gate)                         pricing                        compliance,
                  shipping                                                              analytics                       cost governance)
                  customers                                                             (inventory forecasting)
                  storefront
                  admin
                  search
                  media
                  notifications
```

`★` ai-extraction is the flagship and the single hardest technical asset; everything in P0/P1 exists to make P2 safely shippable.

---

## 4. Two canonical flows through the ecosystem

### A. The 15-minute magic (video → live store)
```
Owner (apps/web mobile capture)
   │ 1. multipart upload 1080p video ──► R2 temp/ prefix (pre-signed URL, direct to storage)
   ▼
ai-extraction (api) ──enqueue──► worker JOB1 ingest ─► JOB2 keyframe (FFmpeg) ─► JOB3 frame-analyze
   │                                                       (ZXing barcode → OpenFoodFacts free;
   │                                                        Gemini Flash batch-8 first pass;
   │                                                        Claude Sonnet fallback < 0.6 conf)
   ▼
JOB4 dedup (pgvector CLIP cosine 0.92) ─► JOB5 merge → draft products w/ per-field confidence
   ▼
content (AI descriptions + SEO)  ─►  ★ HUMAN VERIFICATION GATE (admin review UI) ★
   ▼ (explicit "Publish" click only)
JOB6 publish ─► catalog + inventory + media live ─► search index ─► storefront online
```

### B. A shopper buys (storefront → fulfilled order)
```
Shopper (apps/web) ─► search (Meili tenant token) ─► catalog/inventory (api) ─► cart
   ▼
payments: Stripe Checkout (embedded) — destination charge → tenant Connect account, app fee → AICOS
   ▼
orders (created) ─► webhook (BullMQ) confirms ─► inventory decrement ─► shipping (Shippo label)
   ▼
notifications (email confirmation) ─► GA4 Measurement Protocol purchase event ─► analytics
```

---

## 5. Where each external dependency plugs in
| Boundary edge | External system | Owning module |
|---|---|---|
| AI model calls | OpenAI / Anthropic / Gemini | `ai-core` (all agents route through it) |
| Subscription money | Stripe Billing | `billing` |
| Buyer money | Stripe Connect (destination charges) | `payments` |
| Labels & rates | Shippo (P1) → PostNord/Bring direct (P2) | `shipping` |
| Product feed & local presence | Google Merchant API v1, GBP, GSC, GTM, GA4, Maps | `google` |
| Object storage | MinIO (dev) / Cloudflare R2 (prod) | `media` |
| Full-text search | Meilisearch | `search` |
| Transactional email | SMTP/SendGrid (Mailhog dev) | `notifications` |
| Paid acquisition | Meta / TikTok / Pinterest / Google Ads | `marketing` |

See `integration-map.md` for full cost/risk/status detail and `module-map.md` for the complete module registry.
