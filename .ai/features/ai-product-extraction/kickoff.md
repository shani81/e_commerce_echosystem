# AI Product-Extraction — Kickoff (vertical slice)

The flagship loop is now wired end-to-end with a **mock analyzer**, so the
architecture + the mandatory **human review gate** are real and exercisable while
the model integration is dropped in incrementally. See `architecture.md` /
`decisions.md` for the full design (JOB 0→6, XT-01..XT-18).

## What works now (this slice)
**API — `apps/api/src/extraction/`** (`/api/v1/extractions`, RBAC `extraction:*`):
- `POST /extractions { mediaId, storeId?, source? }` → creates an `ExtractionJob`
  (QUEUED) from an uploaded `MediaAsset` and enqueues `extraction.run`.
- `GET /extractions` (paginated) · `GET /extractions/:id` (job + results +
  review items + linked product) — the review-UI read model.
- `POST /extractions/results/:resultId/accept` → **human gate**: turns a reviewed
  `ExtractionResult` into a **DRAFT `Product`** (+ default variant carrying
  `fieldConfidence`), provenance-linked via `Product.extractionResultId`,
  `aiGenerated=true`. Re-accepting is rejected. Nothing auto-publishes (XT-08).

**Worker — `apps/worker/src/queues/extraction.processor.ts`**:
- Real pipeline *shape*: `QUEUED → INGESTING (sample) → ANALYZING → MERGING →
  AWAITING_REVIEW`, persisting `ExtractionFrame` + `ExtractionResult` +
  `ExtractionReviewItem`. Idempotent (skips AWAITING_REVIEW/PUBLISHED).
- The `analyze` step is a **deterministic mock** (3 products w/ per-field
  confidence) — the single swap point for going live.

**Verified:** kickoff smoke 9/9 (media → extract → AWAITING_REVIEW + 3 results →
accept → DRAFT product + variant → re-accept 400). Reuses the existing schema
(ExtractionJob/Frame/Result/ReviewItem), queue contract, and media upload.

## Roadmap to live AI (drop-in, no schema/contract changes)
1. **Sample (JOB 1)** — FFmpeg frame sampling + pHash dedup → real `ExtractionFrame`
   rows with `blurScore`/`timestampMs` (replace the mock frame loop).
2. **Analyze (JOB 2)** — route frame batches through `@aicos/ai-core`
   (`extraction.primary` → Gemini vision, Claude fallback) + ZXing barcode +
   YOLO pre-filter; write real `rawResponse`/`confidence`. **This is the mock's
   replacement.** (Note: `@aicos/ai-core` providers currently throw
   `NotImplementedError` — implement Gemini `vision()` first.)
3. **Refine (JOB 3)** — re-run `<0.6` confidence frames on a stronger model.
4. **Merge (JOB 4)** — CLIP embeddings in pgvector (cosine ≥0.92) to collapse
   duplicates → weighted `overallConfidence`.
5. **Enrich (JOB 5)** — Product/Content/SEO/Compliance agents.
6. **Publish (JOB 6)** — already covered by the accept gate + the catalog publish flow.
7. **Cost/credits** — record `AiAgentRun`/`AiUsageEvent`, deduct `CreditBalance`.
8. **Review UI** — admin extraction list + triage-band result grid + inline edit /
   merge / accept (the `AI Extraction` nav placeholder).
