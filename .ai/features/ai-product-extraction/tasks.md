# AI Product Extraction — Tasks

**Feature:** AI Product Extraction Engine (video → catalog) `[FLAGSHIP]`
**Module:** `ai-extraction` · **Phase:** P2
**Build status:** Planned — 0% (PHASE 0 planning) — every task below is **Planned / Not started**
**Owner:** AI/ML Architect · **Date:** 2026-06-03

Ordered for de-risking: skeleton + review UI first (with stub AI), then real models, then optimizations. Estimates are engineering-days (1 mid-senior eng). Dependencies reference task IDs.

Legend — Status: ☐ Planned · ◐ In progress · ☑ Done (all ☐ at PHASE 0).

---

## Workstream A — Infra & Skeleton (build first, stub AI)

| ID | Task | Est. | Deps | Status |
|----|------|------|------|--------|
| A1 | Stand up `apps/worker` as a separate NestJS app (own Dockerfile, K8s Deployment, BullMQ bootstrap) | 2 | — | ☐ |
| A2 | Define 6 queues + worker concurrency/limiter config; deterministic jobId helper `hash(tenantId+etag+seg+stage)` | 1.5 | A1 | ☐ |
| A3 | Prisma migration: `ExtractionJob`, `ExtractionFrame`, `ExtractionResult`, `ExtractionReviewItem`, enums (`ExtractionJobStatus`, …); `tenantId` + composite indexes; enable `pgvector` extension + `vector(512)` column | 1.5 | — | ☐ |
| A4 | Tenant-context middleware in worker: transaction-local `set_config(TRUE)` inside `$transaction`, `FORCE RLS`, `AsyncLocalStorage` | 2 | A3 | ☐ |
| A5 | Stub pipeline end-to-end: JOB 1→6 wired with mock frames/results (no real AI) so review UI can be built against real data shapes | 2 | A2,A3 | ☐ |
| A6 | R2/MinIO buckets + lifecycle: `raw/`, `temp/` (48h expiry), `catalog/`; pre-signed multipart upload service | 2 | — | ☐ |
| A7 | KEDA ScaledObject (Redis list length on `frames.analyze:wait`); Prisma migration pre-deploy K8s Job | 1.5 | A1,A6 | ☐ |

## Workstream B — Upload & Ingest

| ID | Task | Est. | Deps | Status |
|----|------|------|------|--------|
| B1 | `POST /v1/extraction/jobs` (initiate) + multipart-complete endpoint; validation (≤20min, ≥1080p, size, codec) | 2 | A3,A6 | ☐ |
| B2 | `VideoIngestWorker` (JOB 1): download, FFmpeg hybrid sampling (uniform 1/3s + scene>0.25 + I-frames) | 3 | A5,B1 | ☐ |
| B3 | Laplacian blur gate + pHash dedup (Hamming<8); store unique frames to `temp/`; FFmpeg memory guard | 2.5 | B2 | ☐ |
| B4 | Fan-out: enqueue `ceil(frames/8)` JOB 2 batches as a BullMQ flow (parent = JOB 4) | 1.5 | B3,A2 | ☐ |
| B5 | Photo-batch fallback: accept N images, skip FFmpeg, enter at JOB 2 | 1.5 | B1,B4 | ☐ |

## Workstream C — Analysis (the AI core of the feature)

| ID | Task | Est. | Deps | Status |
|----|------|------|------|--------|
| C1 | Wire `FrameAnalysisWorker` (JOB 2) to `packages/ai-core` alias `extraction.primary` (gemini-2.5-flash); 8-frame batching; JSON schema + per-field confidence | 4 | B4, ai-core ready | ☐ |
| C2 | Extraction prompt + rubric + few-shot + JSON schema; cacheable stable prefix (prompt caching) | 2.5 | C1 | ☐ |
| C3 | ZXing barcode scan (Stage B) + Open Food Facts / Open Beauty Facts lookup; $0-cost auto-fill path | 3 | C1 | ☐ |
| C4 | YOLOv8-nano pre-filter (Stage A) + region cropping (product/price tags) — *second-iteration optimization* | 4 | C1 | ☐ |
| C5 | CLIP image embedding (self-hosted) → pgvector cosine>0.92 dedup/merge of per-frame raw detections into `ExtractionFrame` (transient in-pipeline, not a table) | 3 | A3,C1 | ☐ |
| C6 | `RefineWorker` (JOB 3): re-run <0.6 confidence on `extraction.fallback` (sonnet→opus) | 2 | C1 | ☐ |

## Workstream D — Merge, Confidence, Enrich

| ID | Task | Est. | Deps | Status |
|----|------|------|------|--------|
| D1 | `MergeWorker` (JOB 4): cross-frame dedup (embedding clusters + fuzzy name>0.85 + price agreement) → `ExtractionResult` | 3 | C5,C6 | ☐ |
| D2 | Weighted confidence calc + 4-band triage (green/yellow/orange/red); best-crop selection (Laplacian) | 2 | D1 | ☐ |
| D3 | Variant grouping (`variantGroupKey`) + merge/split candidate detection | 2.5 | D1 | ☐ |
| D4 | `EnrichWorker` (JOB 5): agent handoffs → Product → Content+SEO → Compliance; attach suggestions to `ExtractionReviewItem`; set status `AWAITING_REVIEW` | 3 | D2, agents ready | ☐ |
| D5 | Notifications: WebSocket + email "products ready to review" | 1 | D4 | ☐ |

## Workstream E — Review UI & Publish

| ID | Task | Est. | Deps | Status |
|----|------|------|------|--------|
| E1 | Admin review UI: triage-banded list, inline edit, price confirm, source-frame viewer | 5 | A5,D2 | ☐ |
| E2 | Merge/split + variant grouping UI actions | 3 | E1,D3 | ☐ |
| E3 | Bulk-approve greens; gap-fill flows for yellow/orange/red | 2 | E1 | ☐ |
| E4 | Compliance verdict surfacing (warn/block) + override-with-justification (audit-logged) | 2 | E1,D4 | ☐ |
| E5 | `PublishWorker` (JOB 6) — triggered ONLY by explicit Publish action: approved `ExtractionResult`s→`catalog.products`, image promotion, Meilisearch index, SEO/sitemap enqueue | 3 | E1, catalog/search ready | ☐ |

## Workstream F — Cost, Observability, Hardening

| ID | Task | Est. | Deps | Status |
|----|------|------|------|--------|
| F1 | `ai.usage` rollup → `ExtractionJob.aiCostMicros` (integer micro-USD); `AiCreditGuard` pre-check before each model call | 2 | C1, billing | ☐ |
| F2 | Per-job OTel trace (JOB 1→6); metrics (frames/video, retry-rate, confidence histogram, cost/video, queue depth, p95) | 2.5 | C1,D1 | ☐ |
| F3 | Per-provider Redis rate-limit buckets + backoff + auto-fallback on 429 (verify across 10 concurrent workers) | 2 | C1 | ☐ |
| F4 | Alerts: queue backlog (SLA), confidence drift, per-tenant burn spike, fallback rate >5% | 1.5 | F2 | ☐ |
| F5 | Mobile/web capture guidance: real-time blur + pace warnings, 1080p/20-min enforcement, in-app tutorial | 4 | B1 | ☐ |
| F6 | Schema validation + price regex + cross-frame agreement + hallucination guards; DOMPurify on any generated HTML | 2 | C1,D4 | ☐ |

## Workstream G — i18n & Scale

| ID | Task | Est. | Deps | Status |
|----|------|------|------|--------|
| G1 | English-first extraction prompts; locale/currency hints; top-5 language i18n in review UI (P2/P3) | 3 | C2,E1 | ☐ |
| G2 | Large-catalog handling (10k+ products): segmented review, pagination under RLS, dedup at scale | 3 | D1,E1 | ☐ |
| G3 | Load test: 50-store onboarding burst; verify <3-min SLA, KEDA scale-out, no queue starvation | 2 | A7,C1 | ☐ |

---

## Milestones

- **M1 — Walking skeleton (stub AI):** A1-A7, B1-B4, E1 → review UI runs end-to-end on mock `ExtractionResult`s. *De-risks the hardest UI before model spend.*
- **M2 — Real extraction (Gemini + Claude fallback):** C1-C3, C5-C6, D1-D2, F1-F3 → real $0.10-$0.15/video `ExtractionResult`s with confidence.
- **M3 — Publish + agents:** D3-D5, E2-E5, F6 → human-gated publish to live catalog with Content/SEO/Compliance suggestions.
- **M4 — Optimize + scale:** C4 (YOLO), F4-F5, G1-G3 → cost/latency tuning, capture UX, i18n, 10k+ products, load-tested SLA.

**Rough total:** ~95 eng-days (~19 weeks for 1 eng; ~7-8 weeks with a 3-person squad working A/B/C, D/E, F/G in parallel after M1). All tasks **Planned** at PHASE 0.
