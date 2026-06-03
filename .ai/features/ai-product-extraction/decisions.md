# AI Product Extraction — Decisions

**Feature:** AI Product Extraction Engine (video → catalog) `[FLAGSHIP]`
**Module:** `ai-extraction` · **Phase:** P2
**Build status:** Planned — 0% (PHASE 0 planning)
**Owner:** AI/ML Architect · **Date:** 2026-06-03

Feature-scoped decisions. Platform-wide decisions live in `.ai/decisions/decision-log.md` (D-001…D-009); these refine those for the flagship and inherit them.

| # | Decision | Reason | Alternatives rejected | Impact |
|---|----------|--------|-----------------------|--------|
| XT-01 | **Staged multi-model pipeline** (barcode → YOLO → cheap LLM → expensive LLM fallback), never one monolithic Claude call per frame | 5-10x better cost efficiency; lets the cheapest tool that can do the job do it | Single Claude-per-frame; single Gemini-per-frame | $0.10-$0.15/video instead of $0.30-$0.80 |
| XT-02 | **Gemini 2.5 Flash = primary first pass; Claude Sonnet 4.6 = low-confidence fallback (<0.6); Opus 4.8 = ambiguous/high-value** | Gemini is 10x cheaper with a 1M context for batching; Claude reserved where accuracy pays | All-Claude (10x cost); all-Gemini (lower accuracy on hard frames) | Best cost/accuracy tradeoff; tier by plan too |
| XT-03 | **Batch 8 frames per Gemini call** (1M context) | Cuts ~80 API calls/video → ~10 (≈8x cost+latency); enables cross-frame dedup reasoning | 1 frame/call | Major latency + cost win |
| XT-04 | **ZXing + Open Food Facts as a $0 pre-step before any LLM** | Auto-fills 20-40% of grocery/FMCG products at zero AI cost; 99.8% barcode accuracy | Skip barcodes; pay LLM for everything | Large cost reduction for grocery; faster, higher-confidence drafts |
| XT-05 | **CLIP embeddings in pgvector (cosine > 0.92) for cross-frame dedup** | Reuses existing PG16 (add extension via Prisma migration) — no new infra; cheapest accurate dedup | Dedicated vector DB; text-only dedup | Same product across 3-8 frames collapses to one `ExtractionResult` |
| XT-06 | **YOLOv8-nano pre-filter** (CPU, ~15ms/frame) to drop junk frames + crop regions | Eliminates 15-25% of frames pre-LLM; cropping cuts ~80% image tokens | Send every frame full-size to the LLM | Lower cost/latency; sharper inputs. (Second-iteration optimization, not a launch blocker) |
| XT-07 | **Confidence scoring (per-field + weighted overall) drives a 4-band triage UI** | Makes review confirm-not-retype; ≥70% land ≥0.65 → enables <15-min north star | Binary "needs review" flag | Minimal owner effort; measurable quality signal |
| XT-08 | **Human verification gate is mandatory — drafts never auto-publish** (inherits D-005/spec) | Hallucination is a near-certainty early; trust is the adoption blocker for AI commerce | Auto-publish high-confidence drafts | Safety + a marketed competitive advantage; JOB 6 only fires on explicit user action |
| XT-09 | **`apps/worker` is a separate NestJS app / K8s Deployment**, autoscaled by **KEDA on queue depth** (not CPU/HPA) | FFmpeg CPU vs HTTP IO scale independently; queue consumers need queue-length scaling | Workers inside `apps/api`; CPU-based HPA | Independent scaling; holds <3-min SLA under onboarding bursts |
| XT-10 | **Deterministic BullMQ job IDs** (`hash(tenantId + s3ETag + segmentIndex + stage)`) for idempotency | BullMQ silently ignores duplicate jobIds → safe at-least-once with no extra bookkeeping | UUID jobs + manual dedup table | Retries/redelivery never double-process |
| XT-11 | **Tenant context via transaction-local `set_config(..., TRUE)` inside `$transaction`; `FORCE RLS` on all tables** | Session-scope leaks tenants across pooled connections — critical isolation flaw | Session-scope set_config; app-only filtering | Hard DB-level isolation in every worker |
| XT-12 | **Enforce 1080p min / 20-min max at upload; Laplacian blur gate; real-time filming guidance** | Capture quality gates accuracy; long video blows cost/latency | Accept any video; charge flat regardless of length | Higher confidence rates; bounded cost; charge credits by length |
| XT-13 | **Photo-batch fallback path at launch** (enters pipeline at JOB 2, skips FFmpeg) | Privacy-shy owners may refuse video (sensitive pricing/competitor visibility) | Video-only | Wider adoption; same downstream pipeline |
| XT-14 | **Multipart client-direct upload to R2/MinIO via pre-signed URLs**; raw under `raw/`, frames under `temp/` with **48h lifecycle** | Avoids large bodies through API; temp frames (300+/video) must auto-clean | Upload through the API; keep all frames | Robust large uploads; storage doesn't fill |
| XT-15 | **Store raw per-frame LLM responses (≤1KB) on each `ExtractionFrame`** | Audit, dispute evidence, dedup debugging, future fine-tuning data | Discard after parsing | Trivial cost; enables fine-tuning + accountability |
| XT-16 | **English-first; top-5 language i18n in P2/P3** | Multi-language product names (Arabic/Thai/CJK) are real but sequencing must not block launch | All-languages day one; English-only forever | Correct sequencing; Meilisearch multi-language ready |
| XT-17 | **Build BullMQ skeleton with stub AI (mock drafts) first** | Decouples review-UI build/test from model integration; de-risks the hardest UI early | Build AI integration before any UI | Parallel workstreams; faster, safer path to demo |
| XT-18 | **Compliance Agent (Opus 4.8) gates publish on restricted categories** | Pharmacy/beauty/health claims carry legal risk; conservative review before live | No automated compliance check | `block` hard-stops publish until fixed/overridden (audit-logged) |

## Inherited platform decisions (apply as-is)

- **D-005** AI behind provider abstraction (Claude default) — this feature calls models only via `packages/ai-core` aliases.
- **D-006** Shared-DB + shared-schema + `tenant_id` + RLS — all extraction tables carry `tenantId` + composite indexes.
- **D-003 / search** Meilisearch — publish indexes drafts→products into Meilisearch (10-word query limit noted for product search UX).
- **D-004 / storage** MinIO local, R2/S3 prod — single SDK path; R2 chosen prod ($0 egress, EU/US jurisdiction locking for GDPR).
