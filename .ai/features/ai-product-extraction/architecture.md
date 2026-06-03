# AI Product Extraction — Architecture

**Feature:** AI Product Extraction Engine (video → catalog) `[FLAGSHIP]`
**Module:** `ai-extraction` · **Phase:** P2
**Build status:** Planned — 0% (PHASE 0 planning)
**Owner:** AI/ML Architect · **Date:** 2026-06-03

This is the end-to-end technical architecture of the flagship pipeline: from video upload through extraction-result creation, human review, and publish. It runs in `apps/worker` (separate NestJS app / K8s Deployment) on BullMQ, calls models exclusively through `packages/ai-core`, and writes only to extraction/review tables — **nothing publishes without an explicit human action**.

---

## 1. End-to-End Pipeline (ASCII)

```
                            ┌──────────────────────────────────────────────────────────────┐
 STORE OWNER (mobile/web)   │                         apps/api (NestJS)                     │
        │                   │                                                              │
        │ 1. POST /v1/extraction/jobs (initiate)                                           │
        │──────────────────▶│  create ExtractionJob(status=QUEUED, awaiting upload)        │
        │                   │  return pre-signed R2 multipart upload URLs (10MB parts)     │
        │◀──────────────────│                                                              │
        │ 2. Multipart PUT video ──────────────────────────────────────────▶ ┌──────────┐ │
        │   (direct to storage, bypasses API)                                │ R2/MinIO │ │
        │                   │                                                 │  raw/    │ │
        │ 3. POST .../complete (etag list)                                    └──────────┘ │
        │──────────────────▶│  validate (size, codec, duration ≤20min, ≥1080p)            │
        │                   │  status=QUEUED → enqueue JOB 1                               │
        └───────────────────┴───────────────────────────┬──────────────────────────────────┘
                                                         │ BullMQ (Redis)
                                                         ▼
                                   apps/worker (NestJS, separate Deployment, KEDA-scaled)
 ┌───────────────────────────────────────────────────────────────────────────────────────────┐
 │ JOB 1  Q:video.ingest        VideoIngestWorker (conc 3, CPU-bound, FFmpeg)                  │
 │   download video → FFmpeg frame sampling (uniform 1/3s + scene>0.25 + I-frames)             │
 │   pHash dedup (Hamming<8) → 60-80 unique frames → store to R2 temp/ (48h lifecycle)         │
 │   fan-out: enqueue ceil(frames/8) JOB 2 batches  ──────────────┐                            │
 ├────────────────────────────────────────────────────────────────┼────────────────────────────┤
 │ JOB 2  Q:frames.analyze      FrameAnalysisWorker (conc 10, IO-bound)   (×N batches, parallel)│
 │   ┌─ Stage A  YOLOv8-nano pre-filter → drop floor/blur/person; crop product+price regions   │
 │   ├─ Stage B  ZXing barcode scan → if hit: Open Food Facts lookup ($0, fills name/brand/cat)│
 │   ├─ Stage C  Vision LLM (ai-core alias extraction.primary = gemini-2.5-flash)              │
 │   │           8 frames/call, JSON schema, per-field confidence  ──┐ low-conf<0.6 ──▶ JOB 3  │
 │   └─ Stage D  CLIP embedding → pgvector cosine>0.92 → persist ExtractionFrame detection     │
 ├────────────────────────────────────────────────────────────────┼────────────────────────────┤
 │ JOB 3  Q:frames.refine       RefineWorker (conc 5)   (only low-confidence frames)           │
 │   re-run on extraction.fallback (claude-sonnet-4-6 → opus-4-8) for ambiguous frames         │
 ├─────────────────────────────────────────────────────────────────────────────────────────────┤
 │ JOB 4  Q:extraction.merge    MergeWorker (conc 5)   (after ALL batches complete — flow gate) │
 │   cross-frame dedup (embeddings + fuzzy name>0.85) → collapse frame detections → ExtractionResult │
 │   compute weighted confidence; assign triage band; pick best image crop per product          │
 ├─────────────────────────────────────────────────────────────────────────────────────────────┤
 │ JOB 5  Q:extraction.enrich   EnrichWorker (conc 5)   (optional, can run pre-review)          │
 │   hand off → Product Agent (normalize/variants) → Content+SEO Agents (drafts) → Compliance   │
 │   results attach to ExtractionReviewItem as suggestions → status=AWAITING_REVIEW; notify owner (WS + email) │
 └───────────────────────────────────────────────┬─────────────────────────────────────────────┘
                                                  │
                                                  ▼
        ┌──────────────────────────────────────────────────────────────────┐
        │  apps/admin — HUMAN REVIEW UI                                      │
        │  triage by band (green/yellow/orange/red); inline edit; merge/split│
        │  confirm price; bulk-approve green; fill gaps                       │
        └───────────────────────────────────┬──────────────────────────────┘
                                             │ 4. owner clicks PUBLISH  (the ONLY path to live)
                                             ▼
 ┌─────────────────────────────────────────────────────────────────────────────────────────────┐
 │ JOB 6  Q:catalog.publish     PublishWorker (conc 5)   (triggered ONLY by explicit user action)│
 │   move approved ExtractionResult → catalog.products (+ variants, images promoted temp/→ catalog/) │
 │   index in Meilisearch; trigger SEO/sitemap; status=PUBLISHED                                 │
 └─────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Critical invariant:** JOB 6 is **never** auto-enqueued after JOB 5. It is triggered only by an authenticated owner "Publish" action (D: "Nothing AI-generated publishes automatically"; architecture research: human verification is a non-negotiable architectural gate).

---

## 2. Stage-by-Stage Detail

### Stage 0 — Upload & Validation
- Client requests pre-signed **multipart** upload URLs; uploads **directly to R2/MinIO** in 10MB parts (bypasses API to avoid large bodies and 502s on slow connections). On `complete`, the API validates: size cap, container/codec, **duration ≤ 20 min**, **resolution ≥ 1080p**, frame-rate sanity. Reject early with actionable errors.
- Raw video lands under `raw/{tenantId}/{jobId}/`; intermediate frames under `temp/{tenantId}/{jobId}/` with a **48h lifecycle expiry** (300+ JPEGs/5-min video accumulate fast — architecture research).
- A **photo-batch fallback** path accepts N images instead of a video and skips JOB 1's FFmpeg step, entering at JOB 2 (for privacy-shy owners — competitors research).

### Stage 1 — Frame Sampling (JOB 1, FFmpeg)
- Hybrid sampling: uniform `fps=1/3` baseline + `select=gt(scene,0.25)` scene supplement + I-frame extraction (`pict_type=I`) for barcodes (sharpest, least blur).
- **Blur gate:** Laplacian variance per frame; drop frames below threshold before they reach a model (saves cost + prevents bad OCR).
- pHash dedup (Hamming < 8) → 60-80 unique frames for a 5-min video.
- **Memory guard:** enforce max resolution/length at upload to avoid FFmpeg OOM on 4K/long video (worker pod would be OOMKilled — architecture research).

### Stage 2 — Frame Analysis (JOB 2, fan-out ×N)
- **A. YOLOv8-nano pre-filter** (~15ms/frame CPU): classes shelf/product/price-tag/barcode/person/floor/blur; drop non-shelf frames (-15-25%); crop product + price regions (cropping cuts ~80% image tokens).
- **B. ZXing barcode** on I-frame crops → Open Food Facts / Open Beauty Facts lookup → instant name/brand/category at **$0 LLM** (20-40% of grocery).
- **C. Vision LLM** via `ai-core` alias `extraction.primary` (gemini-2.5-flash): **8 frames/call** (1M context, cross-frame reasoning), strict JSON schema, per-field confidence. Cacheable prompt prefix (rubric+schema) → cache hit on batch 2+.
- **D. CLIP embedding** → pgvector cosine > 0.92 → attach detection to the existing `ExtractionFrame` cluster or persist a new per-frame detection; pHash pre-check skips identical frames. (Each per-frame detection is a transient *raw detection* record carried inside the `ExtractionFrame` payload — not its own table; cross-frame collapse happens in JOB 4.)

### Stage 3 — Refine (JOB 3, low-confidence only)
- Frames/detections with overall confidence < 0.6 re-run on `extraction.fallback` (claude-sonnet-4-6, then opus-4-8 for the hardest). Typically ~20% of frames → the bulk of accuracy at a fraction of full-Claude cost.

### Stage 4 — Merge (JOB 4, flow gate)
- BullMQ **flow** (parent waits on all JOB 2/3 children). Cross-frame dedup: embedding clusters + fuzzy name (>0.85) + same-price agreement collapse the transient per-frame raw detections (from `ExtractionFrame`) → one `ExtractionResult` per SKU. Pick the sharpest crop (Laplacian) as the product image.
- Compute weighted confidence (`ocr*.35 + barcode*.25 + llm*.20 + price*.15 + multiframe*.05`); assign triage band; flag review-required (<0.65).

### Stage 5 — Enrich (JOB 5)
- Agent handoffs (via BullMQ, never sync): **Product Agent** (normalize, variant grouping, merge/split proposals) → **Content Agent** + **SEO Agent** (draft descriptions/metadata) → **Compliance Agent** (pass/warn/block). All results attach to the `ExtractionReviewItem` as *suggestions*. Status → `AWAITING_REVIEW`; notify owner over WebSocket + email.

### Stage 6 — Publish (JOB 6, human-triggered)
- Approved `ExtractionResult`s → `catalog.products` (+ variants); images promoted `temp/` → `catalog/`; Meilisearch index; SEO/sitemap jobs enqueued; `ExtractionJob.status=PUBLISHED`.

---

## 3. Queue & Worker Design (BullMQ)

```typescript
// packages/ai-core (or apps/worker) — queue names
export const EXTRACTION_QUEUES = {
  VIDEO_INGEST:   'video.ingest',
  FRAMES_ANALYZE: 'frames.analyze',
  FRAMES_REFINE:  'frames.refine',
  MERGE:          'extraction.merge',
  ENRICH:         'extraction.enrich',
  CATALOG_PUBLISH:'catalog.publish',
} as const;

export const WORKER_CONFIG = {
  VideoIngestWorker:   { concurrency: 3,  limiter: { max: 6,  duration: 60_000 } }, // CPU/FFmpeg
  FrameAnalysisWorker: { concurrency: 10, limiter: { max: 60, duration: 60_000 } }, // IO/LLM (global Gemini RPM cap)
  RefineWorker:        { concurrency: 5 },
  MergeWorker:         { concurrency: 5 },
  EnrichWorker:        { concurrency: 5 },
  PublishWorker:       { concurrency: 5 },
} as const;

export const RETRY_CONFIG = { attempts: 3, backoff: { type: 'exponential', delay: 2000 } };
```

**Idempotency (architecture research):** deterministic `jobId = hash(tenantId + s3ETag + segmentIndex + stage)`. BullMQ silently ignores `add()` for an existing jobId (active/waiting/completed) → safe at-least-once redelivery with zero extra Redis bookkeeping. Webhook/queue retries never double-process.

**Fan-out / fan-in:** JOB 1 fans out `ceil(frames/8)` JOB 2 children; a BullMQ **flow** parent (JOB 4) waits for all children (incl. JOB 3 refinements) before merging.

**Tenant isolation:** every worker sets the Postgres tenant context inside a `$transaction` via transaction-local `set_config(..., TRUE)` (NOT session-scope — pool reuse would leak tenants). `FORCE ROW LEVEL SECURITY` on all tables; `AsyncLocalStorage` carries `tenantId` to non-DB code. (Security + architecture research.)

**The global Gemini RPM limiter** on `FrameAnalysisWorker` (`limiter` is enforced across all worker instances via Redis) prevents 10 concurrent workers collectively blowing the provider rate limit; on `429`, `ai-core` fails over to Claude.

---

## 4. Autoscaling (prod, K8s)

- `apps/worker` is its **own Deployment**, separate from `apps/api` (FFmpeg CPU vs HTTP IO scale independently — architecture research).
- **KEDA** scales worker pods on **Redis list length** (`bull:frames.analyze:wait`), **not CPU** — standard HPA is wrong for queue consumers. A 50-store onboarding burst spins up FrameAnalysisWorkers to hold the <3-min SLA; scales to zero when idle.
- Prisma migrations run as a **K8s pre-deploy Job**, never in-process (avoids race when multiple pods boot).

---

## 5. Data Model (Prisma sketch)

```prisma
model ExtractionJob {
  id           String              @id @default(cuid())
  tenantId     String
  videoKey     String?             // R2 object key (null for photo-batch)
  source       ExtractionSource    // VIDEO | PHOTO_BATCH
  status       ExtractionJobStatus // QUEUED|INGESTING|PREFILTERING|ANALYZING|DEDUPLICATING|MERGING|AWAITING_REVIEW|PUBLISHING|PUBLISHED|FAILED
  frameCount   Int?
  resultCount  Int?
  durationMs   Int?
  aiCostMicros Int?                // integer micro-USD, rolled up from ai.usage events
  errorMsg     String?
  createdAt    DateTime            @default(now())
  updatedAt    DateTime            @updatedAt
  frames       ExtractionFrame[]
  results      ExtractionResult[]
  @@index([tenantId])
  @@index([tenantId, createdAt])   // composite required under RLS to avoid full scans
}

// Per-frame analysis record (one row per sampled, surviving frame).
// Holds the transient per-frame "raw detections" as JSON — these are an
// in-pipeline structure collapsed into ExtractionResult at JOB 4, NOT a table.
model ExtractionFrame {
  id          String   @id @default(cuid())
  tenantId    String
  jobId       String
  frameKey    String                          // crop/frame object key in temp/
  detections  Json                            // transient raw detections: [{ bbox, label, fields, conf }]
  barcode     String?                         // ZXing hit, if any
  embedding   Unsupported("vector(512)")?     // CLIP, pgvector dedup
  confidence  Float?
  rawResponse Json?                           // per-frame LLM response (audit/fine-tune; ≤1KB)
  createdAt   DateTime @default(now())
  @@index([tenantId, jobId])
}

// One deduplicated candidate product per SKU (the merge output).
model ExtractionResult {
  id                String   @id @default(cuid())
  tenantId          String
  jobId             String
  name              String?
  priceCents        Int?                  // integer minor units (cents); never Decimal/Float
  currency          String   @default("USD")
  barcode           String?
  brand             String?
  category          String?
  variantGroupKey   String?               // products sharing this key are variant siblings
  imageKeys         String[]              // crops in temp/, promoted on publish
  embedding         Unsupported("vector(512)")?   // pgvector dedup
  confidenceOverall Float
  confidenceFields  Json                  // { name, price, barcode, category, image, variant }
  triageBand        TriageBand            // GREEN | YELLOW | ORANGE | RED
  contentSuggestion Json?                 // Content/SEO agent drafts
  complianceVerdict ComplianceVerdict?    // PASS | WARN | BLOCK
  sourceFrames      String[]
  reviewItem        ExtractionReviewItem?
  createdAt         DateTime @default(now())
  @@index([tenantId, jobId])
  @@index([tenantId, barcode])
}

// The human-gate record: one review row per ExtractionResult.
model ExtractionReviewItem {
  id             String   @id @default(cuid())
  tenantId       String
  resultId       String   @unique
  reviewRequired Boolean
  status         ExtractionReviewStatus  // PENDING_REVIEW | APPROVED | REJECTED | MERGED
  reviewedBy     String?
  reviewedAt     DateTime?
  createdAt      DateTime @default(now())
  @@index([tenantId, status])
}
```

---

## 6. SLA, Cost & Observability

- **Latency SLA:** < 3 min upload→"review ready" (measured 75-110s with 10 concurrent FrameAnalysisWorkers + parallel Gemini batches).
- **Cost:** ~$0.10-$0.15 per 5-min video (Gemini first pass + ~20% Claude retries + compute); rolled up from `ai.usage` into `ExtractionJob.aiCostMicros` (integer micro-USD).
- **Per-job tracing:** one OTel trace spans JOB 1→6; every `ai-core` call nests under it. Metrics: frames/video, retry-rate, confidence-band histogram, cost/video, queue depth, p95 stage latency.
- **Alerts:** queue backlog (SLA risk → KEDA scale check), confidence drift (>30% below 0.5 → model regression), per-tenant burn spike (cost-bomb), provider fallback rate >5%.

---

## 7. Integration Points

- **`packages/ai-core`** — all vision/chat via feature aliases; routing, fallback, prompt-cache, cost events, guardrails.
- **`catalog`** — publish target; variant grouping.
- **`media`** — R2/MinIO storage, image promotion, lifecycle rules.
- **`search`** — Meilisearch indexing on publish.
- **`billing`** — `ai.usage` → AI-credit deduction; `AiCreditGuard` pre-checks before each model call.
- **`content` / `seo` / `compliance` agents** — enrichment handoffs.
- **`notifications`** — WebSocket + email "your products are ready to review".
