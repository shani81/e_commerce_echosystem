# AI Product Extraction — Research Digest

**Feature:** AI Product Extraction Engine (video → catalog) `[FLAGSHIP]`
**Module:** `ai-extraction` · **Phase:** P2
**Build status:** Planned — 0% (PHASE 0 planning)
**Owner:** AI/ML Architect · **Date:** 2026-06-03

> Full feasibility deep-dive: `.ai/research/ai/extraction-feasibility.md`. This file is the feature-folder synthesis: the load-bearing findings, the chosen approach, and what they mean for the build.

---

## Bottom line

Turning a store-walkthrough video into a structured product catalog is **technically feasible today at commercially viable cost**. A 5-minute 1080p walkthrough through a **staged multi-model pipeline** costs **~$0.10-$0.15** in AI fees with **75-110s** end-to-end latency, and lands draft products with per-field confidence scores for a mandatory human review gate.

This is **uncontested market territory** (competitors research): every incumbent (Shopify, Wix, BigCommerce, Woo, Squarespace, Ecwid, Shoplazza) requires manual catalog entry — 8-50+ hours / 2-4 weeks for a non-technical owner with 100 SKUs. Every existing AI feature runs *downstream* of a catalog you already typed (generation direction). AICOS inverts it (extraction direction). No incumbent or AI-native startup offers video-to-catalog extraction for physical retail.

---

## The pipeline (research-validated, maps 1:1 onto our stack)

1. **Upload** → client multipart-uploads video directly to R2/MinIO (10MB chunks; 500MB = 50 parts), pre-signed URLs (no large body through the API).
2. **Frame sampling** (FFmpeg) → hybrid: uniform 1-frame/3s baseline + scene-change (>0.25) supplement + I-frame extraction for barcodes. 5-min video: 9,000 raw → ~100 → **60-80 unique** after pHash dedup (Hamming <8).
3. **Scene/shelf pre-filter** (YOLOv8-nano, ~15ms/frame CPU) → drop floor/ceiling/blur/person frames (eliminates 15-25%); crop product + price-tag regions (cropping cuts ~80% of image tokens).
4. **Barcode scan** (ZXing, 99.8% on clean codes, 0.12s) on I-frames → for hits, query **Open Food Facts / Open Beauty Facts** → auto-populate name/brand/category **at $0 LLM cost** (20-40% of grocery/FMCG products).
5. **Vision LLM first pass** — **Gemini 2.5 Flash**, frames **batched 8/call** (1M context) for cross-frame reasoning; OCR + name + price + variant → JSON + per-field confidence.
6. **Dedup** — CLIP image embeddings in **pgvector** (cosine >0.92) merges the same product across 3-8 frames; fuzzy name match (>0.85) as a second pass.
7. **Low-confidence fallback** — frames/products <0.6 confidence re-run on **Claude Sonnet 4.6**; ambiguous/high-value on **Opus 4.8**.
8. **Confidence scoring** → weighted composite per product; triage bands drive the review UI.
9. **Product drafts** → written to `product_drafts` (never live catalog).
10. **Human review** → owner confirms/edits/merges; confidence bands minimize effort.
11. **Publish** → explicit owner action promotes drafts to `catalog.products`.

ASCII pipeline + queue/worker design: see `architecture.md`.

---

## Model & cost findings (the decisive numbers)

| Model | Cost basis | Per-frame | Role |
|---|---|---|---|
| **Gemini 2.5 Flash** | $0.30/M in | ~$0.00047 | **Primary first pass** (10x cheaper than Claude) |
| Gemini 2.5 Flash-Lite | $0.10/M in | ~$0.00016 | Pure-OCR sub-tasks |
| **Claude Sonnet 4.6** | $3.00/M in (`w*h/750`, cap 1,568 tok) | ~$0.0047 | **Low-confidence fallback** (<0.6) |
| Claude Opus 4.8 | $15/M in (up to 4,784 tok/img) | higher | Ambiguous/high-value frames |
| GPT-4.1 | $2.00/M in | ~$0.004-0.006 | Tertiary fallback |
| Google Vision (TEXT_DETECTION) | $1.50/1k imgs | — | Raw OCR only (no semantics) — not chosen as primary |
| AWS Textract AnalyzeExpense | $8.00/1k pages | — | Structured price labels only — overpriced for our use |
| ZXing barcode | open source (Apache 2.0) | $0 | **Pre-step before any LLM call** |
| CLIP + pgvector | self-hosted | ~$0.00004 | Dedup (no new infra — pgvector on PG16) |

- **Per 5-min video (~70 products): ~$0.10-$0.15.** Per-product amortized: ~$0.0015-$0.002. 15-min/200-product video: ~$0.25-$0.45.
- **Batching 8 frames/Gemini call** cuts API calls ~80 → ~10 (≈8x cost+latency reduction).
- **Revenue:** charge $0.50-$2.00/extraction → **3-13x margin**. Pro tier (80 videos/mo) ≈ $10/mo AI cost.

---

## Confidence scoring (drives the review UX)

Weighted composite per product:
```
confidence = ocr*0.35 + barcode_found*0.25 + llm_recognized*0.20 + price_extracted*0.15 + multiframe_agree*0.05
```
Triage bands: **≥0.85 green "auto-filled"** (1-click approve) · **0.65-0.84 yellow "needs review"** (fill gaps) · **0.40-0.64 orange "low confidence"** · **<0.40 red "manual entry"**. Target: **≥70% of products land ≥0.65** so review is confirm-not-retype — the lever for the <15-minute north star.

---

## Key risks the research surfaced (full mitigations in `risks.md`)

- **Motion blur** — highest-probability failure (~40% of amateur videos); OCR drops 90-95% → 60-75%. Mitigate: Laplacian-variance blur detection, real-time filming guidance, skip blurred frames, enforce 1080p min.
- **Occluded price tags** (~30% of shelf segments) → missing price; surfaced for manual entry via confidence.
- **LLM hallucination** (2-5%) → invented price/name. Mitigate: JSON-schema validation, cross-frame agreement, price regex, **human review gate (non-negotiable)**.
- **Duplicate products not merged** (similar packaging, two sizes) → CLIP at 0.92 may miss; explicit merge/split action in review UI.
- **Gemini deprecation** (2.0 Flash shut down June 2026, ~4-month notice) → pin `gemini-2.5-flash` in config, maintain fallback ID, swap via config not code.
- **Rate limits at scale** → per-provider Redis buckets, backoff, auto-fallback to Claude on `429`.
- **Cost blow-out on long video** → 20-min upload cap; charge credits proportional to length.

---

## What this means for AICOS (implications)

1. **Build the BullMQ skeleton first** with stub AI returning mock drafts, so the review UI flow is built/tested independently of model integration.
2. **Gemini-first, Claude-fallback** tiered routing through `packages/ai-core` is the cost/accuracy sweet spot — don't send every frame to Claude (5-10x worse cost).
3. **ZXing + Open Food Facts is free money** — wire it as a pre-step; auto-fills 20-40% of grocery catalogs with zero AI spend.
4. **pgvector on the existing PG16** for dedup — add via Prisma migration, no new infra.
5. **`apps/worker` is a separate NestJS app** (separate K8s Deployment) — FFmpeg/CPU workloads scale independently of HTTP; KEDA autoscales on queue depth, not CPU (architecture research).
6. **Human verification gate is the product, not a caveat** — market it (addresses the AI-trust concern that slowed Shopify Magic/Wix Harmony adoption).
7. **Mobile capture UX gates accuracy** — enforce 1080p min / 20-min max, real-time blur + pace guidance, in-app tutorial. Provide a **photo-batch fallback** at launch (privacy-shy owners may not film video).
8. **English-first, top-5 language i18n** in P2/P3; multi-language product names are a real Meilisearch + extraction concern (Arabic/Thai/CJK).

---

## Sources

Primary research lives in `.ai/research/ai/extraction-feasibility.md` (full citations) and `.ai/research/competitors/findings.md`. Headline sources: Anthropic Vision Docs & Pricing; Gemini API Pricing (ai.google.dev); Google Cloud Vision Pricing; AWS Textract Pricing; LSR-YOLO retail detection (PLOS One 2025); ZXing/ZBar/Dynamsoft benchmark; multimodal dedup (arXiv 2509.15858); FFmpeg keyframe guides; NestJS BullMQ docs.
