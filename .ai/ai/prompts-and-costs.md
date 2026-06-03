# Prompts & Costs — Per AI Feature

**Module:** `ai-core` / all AI-consuming modules
**Build status:** Planned — 0% (PHASE 0 planning)
**Owner:** AI/ML Architect
**Date:** 2026-06-03

This is the cost/monitoring/fallback playbook for every AI feature in AICOS. All prices below are per-million-token rates from the research digest (June 2026): Gemini 2.5 Flash `$0.30 in / $2.50 out`; Gemini 2.5 Flash-Lite `$0.10 in / $0.40 out`; Claude Sonnet 4.6 `$3.00 in / $15.00 out` (image = `w*h/750`, capped 1,568 tok ≈ `$0.0047/frame`); Claude Opus 4.8 `$15 in / $75 out` (up to 4,784 tok/image); GPT-4.1 `$2.00 in / $8.00 out`; OpenAI `text-embedding-3-large` `$0.13/M`.

**Cross-cutting cost controls** (see `ai-provider-abstraction.md`): feature aliases (swap models via config), prompt caching on stable prefixes (~25-40% input savings on multi-call jobs), exact/semantic response cache, `ai.usage` event per call, `AiCreditGuard` + BullMQ limiter + NestJS Throttler (3-layer rate limit), per-call `budgetUsd`.

---

## Feature Cost Matrix

| Feature | Module | Primary Model | Fallback Chain | Typical Tokens / Call | Est. Cost / Unit | Unit |
|---|---|---|---|---|---|---|
| Video frame extraction (batched vision) | ai-extraction | `gemini-2.5-flash` | sonnet-4-6 → gpt-4.1 | ~8 imgs (≈12.5k in) + 2k out | **$0.10-$0.15** | per 5-min video (~70 products) |
| Low-confidence frame re-analysis | ai-extraction | `claude-sonnet-4-6` | opus-4-8 | ~1.5k in/frame + 0.5k out | ~$0.0047/frame | per re-checked frame (~20% of frames) |
| Barcode-DB enrichment | ai-extraction | none (Open Food Facts) | `gemini-flash-lite` (no DB hit) | 0 (API) | **$0.00** | per barcode (20-40% of grocery) |
| Image-embedding dedup (CLIP) | ai-extraction | self-hosted CLIP | — | 0 (compute) | ~$0.00004 | per crop |
| Product description (single) | content | `claude-sonnet-4-6` | gpt-4.1 → gemini-flash | ~0.8k in + 0.4k out | ~$0.008 | per product |
| Product description (bulk backfill) | content | `gemini-2.5-flash` | sonnet-4-6 | ~0.8k in + 0.4k out | ~$0.0013 | per product |
| SEO metadata + JSON-LD | content/seo | `claude-sonnet-4-6` | gpt-4.1 → gemini-flash | ~0.6k in + 0.3k out | ~$0.006 | per product/page |
| Page copy (landing/category) | content | `claude-sonnet-4-6` | gpt-4.1 | ~1.2k in + 0.8k out | ~$0.016 | per page |
| Store theme/layout generation | store-builder/theme | `claude-sonnet-4-6` (+ image model) | gpt-4.1 | ~3k in + 2k out (+ imgs) | ~$0.04 (+ image gen) | per store |
| Marketing campaign draft | marketing | `claude-sonnet-4-6` | gpt-4.1 → gemini-flash | ~2k in + 1.5k out | ~$0.028 | per campaign |
| Inventory forecast narrative | inventory | `gemini-2.5-flash` | sonnet-4-6 | ~3k in + 0.5k out | ~$0.0022 | per store/run (stats pre-computed) |
| Pricing suggestion | pricing | `claude-sonnet-4-6` | gpt-4.1 | ~1.5k in + 0.6k out | ~$0.014 | per product batch |
| Customer-service reply | customer-service | `claude-sonnet-4-6` | gpt-4.1 → gemini-flash | ~1.5k in + 0.4k out | ~$0.011 | per reply |
| Customer-service FAQ (routine) | customer-service | `gemini-2.5-flash` | sonnet-4-6 | ~1k in + 0.3k out | ~$0.0011 | per reply |
| Analytics insight cards | analytics | `claude-sonnet-4-6` | gpt-4.1 | ~2.5k in + 1k out | ~$0.0225 | per dashboard refresh |
| Google Merchant field-mapping | google | `gemini-2.5-flash` | sonnet-4-6 | ~1k in + 0.5k out | ~$0.0016 | per sync batch |
| Compliance review | compliance | `claude-opus-4-8` | sonnet-4-6 | ~2k in + 0.5k out | ~$0.068 | per high-stakes draft |
| Text embeddings (semantic search/cache) | ai-core | `text-embedding-3-large` | gemini-embed | ~0.5k in | ~$0.000065 | per item |

> The flagship extraction line item is the headline: **$0.10-$0.15 per video** AI cost vs a **$0.50-$2.00 charge** to the tenant → **3-13x margin**. A 15-min video runs $0.25-$0.45 (enforce 20-min cap, charge by length).

---

## Per-Feature Detail

### 1. Video Frame Extraction (FLAGSHIP)

- **Model choice:** Gemini 2.5 Flash first pass — 10x cheaper than Claude per frame and its 1M context lets us send **8 frames per call** (cross-frame dedup reasoning), cutting ~80 calls/video → ~10. Claude Sonnet 4.6 only re-runs the ~20% of frames whose confidence < 0.6; Opus 4.8 reserved for ambiguous/high-value frames.
- **Prompt shape:** stable cacheable prefix (system + extraction rubric + JSON schema + few-shot) → then the 8 frames + locale/category hint. Prefix is identical across all batches of one video, so batch 2+ reads it from prompt cache (~30% input savings).
- **Tokens/cost:** ~12.5k input (8 imgs × ~1,568 + prompt) + ~2k output per batch; ~10 batches/video → **$0.033 Gemini first pass + ~$0.066 Claude retries + compute ≈ $0.10-$0.15/video.**
- **Monitoring:** confidence-band distribution per video (target ≥70% land ≥0.65); cost/video; retry-rate (% frames sent to Claude); latency (target <3 min, measured 75-110s); per-tenant burn.
- **Fallback strategy:** `gemini-flash → claude-sonnet-4-6 → gpt-4.1`. On Gemini `429`, router shifts to Claude (pre-emptive via rate-limit bucket). Pin model IDs in config (Gemini 2.0 was shut down June 2026 — never hardcode).

### 2. AI Content Generation (descriptions / SEO / pages)

- **Model choice:** Claude Sonnet 4.6 for quality/brand-voice on interactive single-item generation; **switch to `gemini-flash` (alias `content.bulk`) for bulk catalog backfill** (100s of products) where cost dominates — 6x cheaper.
- **Prompt shape:** cacheable prefix (brand-voice profile + tone/length rules + schema + locale); per-product variable suffix (attributes). Brand-voice prefix is stable across a tenant's whole catalog → strong prompt-cache reuse.
- **Tokens/cost:** description ~$0.008 (Sonnet) / ~$0.0013 (Gemini bulk); SEO ~$0.006; page copy ~$0.016.
- **Monitoring:** generation cost/product; edit-rate (how often humans rewrite drafts — proxy for quality, drives model/prompt tuning); Merchant Center disapproval rate on SEO output (must stay <20%); profanity/claims filter hits.
- **Fallback strategy:** `claude-sonnet-4-6 → gpt-4.1 → gemini-flash`. Bulk inverts to Gemini-first.

### 3. AI Store Builder + Theme (P3)

- **Model choice:** Claude Sonnet 4.6 for structured layout/theme-token reasoning; image-generation model (behind the same factory) for hero/section imagery. Reference-site "cloning" is inspiration only.
- **Tokens/cost:** ~$0.04 text + image-gen cost (model-dependent) per store. One-time per store build; cache theme tokens.
- **Monitoring:** build cost/store; image-gen spend (the cost driver — cap per build); approval rate (themes accepted vs regenerated); accessibility/contrast pass rate.
- **Fallback strategy:** `claude-sonnet-4-6 → gpt-4.1`; image model has its own fallback.

### 4. Marketing / Pricing / Inventory / Analytics Agents (P4)

- **Model choice:** Sonnet 4.6 for reasoning+explanation (marketing, pricing, analytics); **Gemini Flash for inventory** (high-volume numeric, stats pre-computed in code — the LLM narrates/ranks, never computes totals).
- **Tokens/cost:** marketing ~$0.028/campaign; pricing ~$0.014/batch; inventory ~$0.0022/run; analytics ~$0.0225/refresh.
- **Monitoring:** suggestion-acceptance rate per agent (key quality metric); cost per active store/month; for pricing — guardrail-violation attempts (min-margin/max-step) caught.
- **Fallback strategy:** Sonnet → GPT-4.1 → Gemini (inventory inverts to Gemini-first).

### 5. Customer Service Agent (P4)

- **Model choice:** Sonnet 4.6 for nuanced replies; `gemini-flash` for routine FAQ intents to cut cost.
- **Tokens/cost:** ~$0.011/reply (Sonnet), ~$0.0011 (Gemini FAQ).
- **Monitoring:** auto-reply vs escalation ratio; CSAT on AI replies; escalation accuracy (did it correctly escalate money/complaint intents?); injection-attempt detections.
- **Fallback strategy:** `claude-sonnet-4-6 → gpt-4.1 → gemini-flash`. Low confidence → human (not another model).

### 6. Google Sync (P4) & Compliance (P5)

- **Google:** Gemini Flash (cheap, Google-domain), ~$0.0016/sync batch. Monitor: Merchant disapproval rate, quota usage, scope-availability (consent unbundling).
- **Compliance:** Opus 4.8 (highest stakes), ~$0.068/review — only on high-risk drafts, not every item. Monitor: block-rate, false-positive rate (over-blocking frustrates owners), override frequency.

---

## Monthly Cost-at-Scale (AI API spend, by tier)

Derived from the extraction research model. Extraction dominates early; content/agents grow later.

| Plan | Videos/mo | Extraction $ | Content+SEO $ | Agents (P4) $ | Total AI $/mo | Tenant pays (credits) | Margin |
|---|---|---|---|---|---|---|---|
| Free | 1 (≤20 products) | ~$0.13 | ~$0.10 | — | **~$0.25** | $0 (acquisition) | loss-leader |
| Starter | 4 | ~$0.50 | ~$0.60 | ~$1 | **~$2** | ~$4-8 | 2-4x |
| Growth | 16 | ~$2 | ~$2.50 | ~$4 | **~$9** | ~$25-40 | 3-4x |
| Pro (5 stores) | 80 | ~$10 | ~$12 | ~$20 | **~$42** | ~$150-250 | 3-6x |
| Enterprise (50 stores) | 800 | ~$100 | ~$120 | ~$200 | **~$420** | negotiated | 3-5x |

> Free tier (1 extraction, ≤20 products) is strategically required (competitors research — Ecwid sets the expectation; the non-technical persona won't pay before seeing results). Its ~$0.25 AI cost is an acquisition expense.

---

## Monitoring & Alerting (platform-wide)

- **Per-call:** `ai.usage` event → cost ledger. Dashboards: cost/day/model, cost/feature, cost/tenant, fallback rate, cache-hit ratio, p50/p95/p99 latency.
- **Alerts:**
  - Fallback rate > 5% for any feature (provider degradation) → page on-call.
  - Any model p95 latency regresses 2x → investigate.
  - Tenant AI burn spikes >10x their 7-day baseline → **cost-bomb / abuse alert** (a compromised account can burn $5,000+/hr — security research); auto-throttle via `AiCreditGuard`.
  - Extraction confidence distribution drifts (>30% of products below 0.5) → model/prompt regression.
  - Merchant Center disapproval rate >20% (SEO/Google output) → quality gate; blocks further sync.
- **Budget governance (P5 cost governance):** per-tenant monthly AI-credit ceiling enforced before each call; soft-warn at 80%, hard-stop at 100% (with upsell). Platform-wide daily spend cap with kill-switch.

## Fallback Strategy Summary

1. **Retry same provider** with exponential backoff (`2s/4s/8s`, jitter, ≤3 attempts) on `429`/`5xx`/timeout.
2. **Advance the fallback chain** (next model) if retries exhaust, the provider is unhealthy, or rate-limit bucket is near-empty (pre-emptive).
3. **Fail fast, no failover** on `400` (our bug), `401/403` (config), or `budgetUsd` exceeded.
4. **Degrade gracefully** — extraction can finish a video on a partial provider set; customer-service falls back to *human*, not another model, when confidence is low.
5. **Config-driven** — every model ID and chain lives in `models.json`/`fallbackChains` (Doppler), so deprecations (Gemini-style) are a config edit, not a deploy.
