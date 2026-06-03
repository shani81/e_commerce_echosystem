# AI Product Extraction — Risks & Mitigations

**Feature:** AI Product Extraction Engine (video → catalog) `[FLAGSHIP]`
**Module:** `ai-extraction` · **Phase:** P2
**Build status:** Planned — 0% (PHASE 0 planning)
**Owner:** AI/ML Architect · **Date:** 2026-06-03

Every risk below has a concrete mitigation already designed into `architecture.md` / `decisions.md`. The **human verification gate is the universal backstop** — it is the last line of defense for accuracy risks and is non-negotiable.

## Risk register (summary)

| # | Risk | Likelihood | Impact | Primary mitigation |
|---|------|-----------|--------|--------------------|
| R1 | Blurry / motion-blur video | High (~40% amateur) | Medium | Laplacian blur gate + real-time filming guidance + 1080p min |
| R2 | Missing / occluded prices | High (~30% segments) | Medium | Confidence flags missing price; review UI requires manual entry |
| R3 | Duplicate products not merged | Medium | Medium | CLIP+pgvector (0.92) + fuzzy name; explicit merge/split UI |
| R4 | Mixed / multi-category shelves | Medium | Medium | Per-region crops + category-per-product (not per-frame) |
| R5 | Seasonal / promo / transient items | Medium | Low-Med | Draft flags "seasonal?"; owner toggles availability window |
| R6 | 10k+ products (large store) | Medium | High | Segmented jobs, paginated review, dedup at scale, charge by length |
| R7 | Multi-language product names | Medium | Medium | Locale hints, multilingual models, Meilisearch multi-language |
| R8 | Hallucinated products / prices | Low (2-5%) | High | Schema + price regex + cross-frame agreement + human gate |
| R9 | Provider rate limits / outage | Medium (scale) | Med-High | Per-provider buckets, backoff, auto-fallback chain |
| R10 | Model deprecation (Gemini-style) | Medium | Medium | Model IDs in config (aliases), not code; fallback ID pinned |
| R11 | Cost blow-out / abuse | Low-Med | High | 20-min cap, length-based credits, AiCreditGuard, burn alerts |
| R12 | Cross-tenant leakage | Low | Critical | Transaction-local set_config(TRUE) + FORCE RLS + human gate |
| R13 | Privacy-shy owners won't film | Medium | Medium | Photo-batch fallback at launch |
| R14 | Storage fill from temp frames | Medium | Medium | `temp/` 48h lifecycle expiry rule |

---

## Detail & mitigations

### R1 — Blurry / motion-blur video  *(highest-probability failure)*
Handheld walkthroughs are shaky; ~40% of amateur videos have blur. OCR accuracy collapses from 90-95% to 60-75%.
- **Mitigate:** Laplacian-variance blur score per frame in JOB 1 — drop frames below threshold before any model call (saves cost + prevents bad OCR). **Real-time filming guidance** in the capture UX ("slow down", "hold steady", lux/contrast check). Enforce **1080p minimum** at upload. I-frame extraction prefers the sharpest frames for barcodes. Surviving low-sharpness products get a low image-confidence score → flagged for review.
- **Residual:** some shelf segments blurred throughout → coverage gap, surfaced as "we may have missed this shelf — re-film or add manually."

### R2 — Missing / occluded prices
~30% of shelf segments have price tags hidden behind products, glare on ESL screens, or no tag at all.
- **Mitigate:** price gets its own confidence field; a null/low-confidence price drives the product into a **review band that requires manual entry**, clearly highlighted in the UI. Cross-frame agreement recovers prices visible in *any* frame of the product. Two-stage price-tag detection (YOLO crop → OCR/LLM) maximizes capture. We **never invent a price** (see R8).
- **Residual:** owner manually enters some prices — acceptable, bounded UX burden, clearly scoped by the review UI.

### R3 — Duplicate products not merged
A product appears in 3-8 frames; same product in two sizes has near-identical packaging → CLIP at 0.92 may under- or over-merge.
- **Mitigate:** CLIP embeddings in pgvector (cosine > 0.92) + pHash pre-check + **fuzzy name (>0.85) + price agreement** as a second pass collapse cross-frame dupes. For the size-collision edge case, the review UI exposes an **explicit merge/split action** so the owner corrects the ~rare mistakes. Variant grouping (`variantGroupKey`) intentionally keeps same-product-different-size as **variants of one product**, not duplicates.
- **Residual:** a few merge/split corrections per large catalog — surfaced, not silent.

### R4 — Mixed / multi-category shelves
A single frame may show beverages, snacks, and cleaning supplies together.
- **Mitigate:** YOLO **per-region cropping** isolates individual products before extraction, so category is inferred **per product**, not per frame. The LLM classifies each crop independently against the tenant's taxonomy (Product Agent normalizes). Barcode-DB hits give authoritative category for matched items.
- **Residual:** ambiguous category for unbarcoded niche items → defaults to "Uncategorized", owner re-assigns in review (low effort).

### R5 — Seasonal / promotional / transient items
Holiday stock, end-cap promos, or temporary displays get captured as permanent catalog.
- **Mitigate:** items detected on promo end-caps or with sale/strike-through pricing are flagged `seasonal?` in the draft; the review UI offers an **availability window / "temporary" toggle**. Promo pricing is captured as `sale_price` + `original_price` separately, not as the base price.
- **Residual:** owner decides keep/expire — exactly the kind of judgment the human gate is for.

### R6 — 10k+ products (large store / supermarket)
A large grocery video produces thousands of drafts; review and dedup must not collapse.
- **Mitigate:** **20-min upload cap** bounds a single job; large stores film **multiple segmented videos** (per aisle), each its own job. Review UI is **paginated/virtualized** and grouped by triage band + category (review greens in bulk first). Dedup runs at scale via pgvector indexes; all queries carry composite `(tenantId, …)` indexes to stay fast under RLS. Charge **credits proportional to video length**, not flat. KEDA scales workers for the burst.
- **Residual:** very large catalogs take longer to review — mitigated by bulk-approve of high-confidence greens (the majority).

### R7 — Multi-language product names
Arabic / Thai / CJK / mixed-script packaging; the target TAM is heavily SE-Asia / MENA / LATAM.
- **Mitigate:** pass tenant **locale/currency hints** to the model; Gemini and Claude handle multilingual OCR well. Meilisearch is chosen partly for **native multi-language indexing** (architecture research). **English-first launch, top-5 language i18n in P2/P3** (correct sequencing — competitors research). Review UI localized.
- **Residual:** lower confidence on rare scripts early → more items land in review bands until i18n matures.

### R8 — Hallucinated products / prices  *(highest accuracy stakes)*
LLMs invent a price or name not actually readable (~2-5% of extractions).
- **Mitigate (defense in depth):** strict **JSON-schema validation**; **price-format regex + numeric range** checks; **cross-frame agreement** (a price/name must corroborate across frames or drop in confidence); a product must be supported by ≥1 readable frame (no products conjured from nothing); low confidence forces review; and the **mandatory human publish gate** catches anything that slips through. Compliance Agent reviews high-risk categories.
- **Residual:** near-zero reaches *live* catalog because nothing publishes without human confirmation. This gate is **marketed as a feature**, not a caveat (directly answers the AI-trust concern that slowed Shopify Magic / Wix Harmony).

### R9 — Provider rate limits / single-provider outage
At Pro tier (80 videos/mo, concurrent), Gemini RPM limits or an outage could stall extraction.
- **Mitigate:** per-`(provider,model)` **Redis token buckets** shared across all 10 FrameAnalysisWorkers (so concurrency can't collectively exceed RPM); exponential backoff with jitter; **auto-fallback chain** `gemini → claude → gpt-4.1` on 429/5xx/timeout (pre-emptive shift when a bucket is near-empty). BullMQ queue limiter caps global throughput. Extraction can **finish a video on a partial provider set**.
- **Residual:** brief latency increase during failover — within the <3-min SLA buffer.

### R10 — Model deprecation
Gemini 2.0 Flash was shut down June 2026 on ~4-month notice; models churn.
- **Mitigate:** model IDs live in **config aliases (`extraction.primary`)**, never hardcoded; ops repoints an alias to roll forward with **zero deploys**; a fallback model ID is always pinned. The provider abstraction means a discontinued provider is a config edit, not a rewrite.
- **Residual:** monitor provider deprecation notices; quarterly model review (also tracks Shoplazza/Shopify for any video-extraction announcement — competitors research).

### R11 — Cost blow-out / extraction abuse
A 15-min video is $0.25-$0.45; a compromised/trial-abuse account could burn $5,000+/hour (security research).
- **Mitigate:** **20-min hard cap** + reject 4K/oversized at upload (also prevents FFmpeg OOM); **credits charged by video length**; three rate-limit layers (NestJS Throttler, **AiCreditGuard** on Redis credit balance, BullMQ queue limiter); per-tenant **burn-spike alert** (>10x 7-day baseline) with auto-throttle; per-call `budgetUsd` ceiling refuses runaway calls. Free tier capped at **1 extraction / ≤20 products**.
- **Residual:** abuse is bounded to a tiny credit allotment before hard-stop.

### R12 — Cross-tenant data leakage
A worker mis-setting tenant context could write Tenant A's products into Tenant B's catalog (Critical).
- **Mitigate:** tenant context set via **transaction-local `set_config(..., TRUE)` inside `$transaction`** (never session-scope — pool reuse leaks); **`FORCE ROW LEVEL SECURITY`** on every table; PgBouncer in **transaction pooling** mode; all tables carry `tenantId`; `AsyncLocalStorage` propagates it to non-DB code; PG 16.9+ (CVE-2025-8713 fix). The **human gate** is the final backstop — wrong products would be caught in review before publish.
- **Residual:** Critical-impact but Low-likelihood with these controls; this is a P0 hard requirement, enforced architecturally (the `withTenant` wrapper), not left to individual developers.

### R13 — Privacy-shy owners won't film video
Owners may refuse to record (sensitive pricing, competitor visibility, unfamiliarity).
- **Mitigate:** **photo-batch fallback at launch** — upload a set of shelf photos instead of video; the pipeline skips FFmpeg and enters at JOB 2, sharing all downstream logic. In-app explanation that the video is private to their store and never published.
- **Residual:** photo batches give less coverage than a continuous pan — acceptable; owner controls scope.

### R14 — Storage fill from intermediate frames
300+ JPEGs per 5-min video accumulate fast and would fill storage.
- **Mitigate:** `temp/` prefix has a **48-hour R2 lifecycle expiry**; only the few chosen product crops are promoted to `catalog/` on publish; raw video retention policy set per plan.
- **Residual:** none material with lifecycle rules in place.

---

## Defense-in-depth summary

```
 capture guidance ─▶ upload validation ─▶ blur/dedup gates ─▶ schema+regex+cross-frame checks
        └─▶ confidence scoring ─▶ triage bands ─▶ HUMAN REVIEW + PUBLISH (the backstop) ─▶ Compliance gate
```
No single failure reaches the live catalog: accuracy errors are caught by validation, then confidence triage, then the mandatory human gate; isolation errors are caught by RLS + the human gate; cost/abuse is caught by the three rate-limit layers + burn alerts.
