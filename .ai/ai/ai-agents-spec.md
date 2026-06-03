# AI Agents Specification

**Module:** `ai-core` — Agent Orchestration
**Build status:** Planned — 0% (PHASE 0 planning)
**Owner:** AI/ML Architect
**Date:** 2026-06-03

Every agent runs on the orchestration runtime in `packages/ai-core` (see `ai-provider-abstraction.md` §9). Agents **never** call providers directly — they go through `AiCoreService`, so routing, fallback, caching, cost tracking, and guardrails apply uniformly. Agents hand off to each other via **BullMQ jobs**, never synchronous calls.

**Universal guardrails (apply to all 12 agents):**
- JSON-schema-validated outputs; malformed output triggers one repair retry, then fails.
- Per-call `budgetUsd` + `AiCreditGuard` (tenant credit balance + per-tier rate limit).
- Prompt-injection isolation: user/customer/scraped content is always role-`user`, never merged into the system prompt.
- All generated **HTML** sanitized via DOMPurify before persistence.
- All agent runs are traced (OTel) and emit `ai.usage` events.
- **Human-in-the-loop:** no agent writes to a *live* table. Agents write to `*_draft` / `*_suggestion` tables; a human action promotes drafts to live (D: "Nothing AI-generated publishes automatically").

Provider/model names reference **config aliases** (repointable without code changes). Default provider is Anthropic Claude (D-005).

---

## Agent Roster (SPEC.aiAgents — all 12)

| # | Agent | Module | Phase | Default Provider/Model | Human Gate |
|---|-------|--------|-------|------------------------|-----------|
| 1 | Extraction Agent | ai-extraction | P2 | Google / `gemini-2.5-flash` | Yes (review-before-publish) |
| 2 | Product Agent | ai-extraction / catalog | P2 | Anthropic / `claude-sonnet-4-6` | Yes (draft review) |
| 3 | Design Agent | store-builder / theme-engine | P3 | Anthropic / `claude-sonnet-4-6` (+ image model) | Yes (theme preview approve) |
| 4 | SEO Agent | content | P2 | Anthropic / `claude-sonnet-4-6` | Yes (draft review) |
| 5 | Content Agent | content | P2 | Anthropic / `claude-sonnet-4-6` | Yes (draft review) |
| 6 | Marketing Agent | marketing | P4 | Anthropic / `claude-sonnet-4-6` | Yes (campaign approve) |
| 7 | Inventory Agent | inventory / analytics | P4 | Google / `gemini-2.5-flash` | Yes (reorder approve) |
| 8 | Pricing Agent | pricing | P4 | Anthropic / `claude-sonnet-4-6` | Yes (price-change approve) |
| 9 | Customer Service Agent | customer-service | P4 | Anthropic / `claude-sonnet-4-6` | Partial (auto-reply low-risk, escalate else) |
| 10 | Analytics Agent | analytics | P4 | Anthropic / `claude-sonnet-4-6` | No (read-only insights) |
| 11 | Google Agent | google | P4 | Google / `gemini-2.5-flash` | Yes (sync approve) |
| 12 | Compliance Agent | (cross-cutting / P5) | P5 | Anthropic / `claude-opus-4-8` | Advisory (blocks publish on violation) |

---

## 1. Extraction Agent  `[FLAGSHIP]`

- **Purpose:** Turn store-walkthrough video frames into structured draft products (name, price, brand, barcode, category, variant, image crop) with per-field confidence. The core of the north star.
- **Inputs:** Batches of 5-8 deduplicated frames (R2 URLs / Files API IDs), barcode-DB enrichments (Open Food Facts), tenant locale/currency hint, store-category hint.
- **Outputs:** `ProductExtractionResult[]` — per frame-batch, each with `{name, price, currency, barcode, brand, category, variant, confidenceFields{}, confidenceOverall, sourceFrames[]}` validated against the extraction JSON schema.
- **Preferred:** Google `gemini-2.5-flash` (10x cheaper, 1M context → 8 frames/call). **Fallback chain:** `gemini-flash → claude-sonnet-4-6 → gpt-4.1`. Low-confidence (<0.6) frames re-run on `claude-sonnet-4-6`; ambiguous/high-value on `claude-opus-4-8`.
- **Guardrails:** price regex + numeric-range validation; cross-frame agreement check; **no hallucinated products** — a product must be supported by ≥1 readable frame; barcode checksum validation; confidence floor forces review.
- **Human-in-the-loop:** **Mandatory.** Writes only to `product_drafts`. Never to `catalog.products`. The owner's "Publish" click is the gate.
- **Hands off to:** Product Agent (normalize), Content Agent (descriptions), SEO Agent.

## 2. Product Agent

- **Purpose:** Normalize and enrich raw extraction drafts into clean catalog records: canonical title casing, brand/category mapping to the tenant's taxonomy, variant grouping (size/color/flavor → one product, many variants), unit normalization, duplicate merge/split suggestions.
- **Inputs:** `product_drafts` from Extraction Agent, tenant taxonomy, existing catalog (for dedup against already-listed products), barcode-DB metadata.
- **Outputs:** Enriched `product_drafts` with proposed variant structure, category assignment, merge/split actions, normalized attributes; per-field confidence.
- **Preferred:** Anthropic `claude-sonnet-4-6` (best structured/semantic). **Fallback:** `gpt-4.1 → gemini-flash`.
- **Guardrails:** never invents prices/SKUs; variant grouping requires explicit label evidence; merge suggestions surfaced as suggestions, not auto-applied.
- **Human-in-the-loop:** Yes — review UI shows proposed groupings/merges; owner confirms.
- **Hands off to:** Content Agent, SEO Agent, Pricing Agent (price suggestions).

## 3. Design Agent

- **Purpose:** Generate storefront design/theme (P3): layout, color palette, typography, section composition from a store name + category + optional reference site (visual *inspiration*, never copying). Drives AI Store Builder + Theme Generation.
- **Inputs:** Store name, category, brand assets (logo/colors if any), optional reference-site screenshot/structure (cloned for inspiration), product mix summary.
- **Outputs:** Theme spec (design tokens: colors, fonts, spacing, component variants) + section layout JSON for the storefront renderer; optional generated hero imagery.
- **Preferred:** Anthropic `claude-sonnet-4-6` for structured theme/layout reasoning + an image-generation model (P3, behind the same factory) for imagery. **Fallback:** `gpt-4.1`.
- **Guardrails:** website cloning is *inspiration only* — no verbatim copy of copyrighted text/markup; trademark/logo reuse blocked; generated CSS/HTML sanitized; accessibility (contrast) checks on palettes.
- **Human-in-the-loop:** Yes — live preview; owner approves before the theme goes live.
- **Hands off to:** Content Agent (page copy), SEO Agent.

## 4. SEO Agent

- **Purpose:** Generate SEO metadata: titles, meta descriptions, slugs, structured data (Product/Offer JSON-LD), alt text, Open Graph tags, and keyword suggestions — tuned for Google Merchant Center compliance (title length, GTIN, image rules).
- **Inputs:** Product draft/record, tenant locale, target keywords, Merchant Center field constraints.
- **Outputs:** `seo_drafts` per product/page: `{metaTitle, metaDescription, slug, jsonLd, ogTags, altText[], keywords[]}` schema-validated against Merchant Center requirements.
- **Preferred:** Anthropic `claude-sonnet-4-6`. **Fallback:** `gpt-4.1 → gemini-flash`. Bulk runs may use `gemini-flash` for cost.
- **Guardrails:** title/description length caps (Merchant Center); no keyword stuffing; factual consistency with product data (no invented attributes); JSON-LD schema-valid; profanity/policy filter.
- **Human-in-the-loop:** Yes — surfaced in review UI; auto-applied only after publish approval.
- **Hands off to:** Google Agent (Merchant Center sync), Content Agent.

## 5. Content Agent

- **Purpose:** Generate product descriptions, category/landing-page copy, and marketing microcopy in the tenant's brand voice and locale. (Note: AICOS *extracts* catalog data then *generates* copy — the inverse of, and complementary to, Shopify Magic.)
- **Inputs:** Product record/attributes, brand-voice profile, locale/language, length/tone settings, existing catalog for consistency.
- **Outputs:** `content_drafts`: short + long descriptions, bullet highlights, page copy — sanitized HTML/markdown.
- **Preferred:** Anthropic `claude-sonnet-4-6` (brand-voice quality). **Bulk alias:** `gemini-flash` for high-volume catalog backfill. **Fallback:** `gpt-4.1`.
- **Guardrails:** factual grounding (only attributes present in product data); brand-voice adherence; **DOMPurify** on all HTML; profanity/claims filter (no medical/health claims for pharmacy/beauty without disclaimer — see Compliance Agent); multi-language correctness.
- **Human-in-the-loop:** Yes — draft review; bulk-generated copy still requires publish approval.
- **Hands off to:** SEO Agent, Marketing Agent.

## 6. Marketing Agent

- **Purpose:** Plan and draft marketing campaigns: email/newsletter copy, ad creative text for Meta/TikTok/Pinterest/Google Ads, audience/segment suggestions, promo/discount ideas, posting schedule.
- **Inputs:** Catalog, sales/analytics signals, customer segments, channel constraints (ad platform char limits/policies), budget, brand voice.
- **Outputs:** `campaign_drafts`: per-channel creative variants, targeting suggestions, schedule, projected spend — never auto-launched.
- **Preferred:** Anthropic `claude-sonnet-4-6`. **Fallback:** `gpt-4.1 → gemini-flash`.
- **Guardrails:** ad-platform policy compliance (prohibited claims, restricted categories); spend ceiling honored; no PII in audience exports beyond consented data; DOMPurify on email HTML.
- **Human-in-the-loop:** Yes — owner approves every campaign before any ad/email is launched; Ads API actions deferred to late P4/P5 (restricted scope, audit).
- **Hands off to:** Google Agent (Google Ads, GA4), Analytics Agent (attribution).

## 7. Inventory Agent

- **Purpose:** Forecast demand, flag low-stock/out-of-stock, suggest reorder quantities and timing, detect dead stock and seasonal patterns.
- **Inputs:** Inventory levels, sales velocity, lead times, seasonality history, extraction facing-counts (approximate on-hand), supplier data.
- **Outputs:** `inventory_suggestions`: reorder proposals, stock alerts, forecast curves — with confidence and rationale.
- **Preferred:** Google `gemini-2.5-flash` (cheap, high-volume numeric reasoning) with statistical pre-aggregation done in code (the LLM explains/ranks, code computes). **Fallback:** `claude-sonnet-4-6`.
- **Guardrails:** forecasts are bounded (no negative/absurd quantities); clearly labeled as estimates; never auto-purchases; facing-count inputs flagged ±15-20% accurate.
- **Human-in-the-loop:** Yes — reorder suggestions require approval before any PO.
- **Hands off to:** Pricing Agent (markdown on dead stock), Analytics Agent.

## 8. Pricing Agent

- **Purpose:** Suggest prices and markdowns: margin-based pricing, competitive positioning, promo/clearance recommendations, currency/locale-aware rounding.
- **Inputs:** Costs, current prices, competitor signals, demand/velocity, margin targets, inventory age, extraction-derived prices.
- **Outputs:** `price_suggestions`: per-product proposed price + rationale + projected margin/volume impact.
- **Preferred:** Anthropic `claude-sonnet-4-6` (reasoning + explanation). **Fallback:** `gpt-4.1`.
- **Guardrails:** hard **min-margin floor** and **max-change-per-step** caps (no $0.01 or $9,999 mistakes); never publishes price changes automatically; price-format/currency validation; anti-collusion (no competitor price-matching that violates policy).
- **Human-in-the-loop:** **Yes — strict.** Every price change is owner-approved. Bulk apply still gated.
- **Hands off to:** Marketing Agent (promo), Analytics Agent.

## 9. Customer Service Agent

- **Purpose:** Answer end-customer questions (order status, shipping, returns, product info) on the storefront/portal; draft replies to inbound messages.
- **Inputs:** Customer message, order/customer context (RLS-scoped), catalog, shipping/returns policy, knowledge base.
- **Outputs:** Reply draft or auto-sent reply (low-risk only); escalation ticket with summary for human agents.
- **Preferred:** Anthropic `claude-sonnet-4-6`. **Fallback:** `gpt-4.1 → gemini-flash`. Routine FAQ may use `gemini-flash`.
- **Guardrails:** strict RLS — only the *current customer's* data; never reveals other customers/tenants; no refunds/cancellations executed by the agent (proposes, human/automation confirms); injection-hardened against hostile customer messages; no medical/legal advice.
- **Human-in-the-loop:** **Partial** — auto-reply allowed only for low-risk, high-confidence intents (e.g., "where is my order" with a tracked shipment). Anything touching money, refunds, complaints, or low confidence → escalate to a human with a drafted reply.
- **Hands off to:** Orders/Shipping modules (status lookups), human support queue.

## 10. Analytics Agent

- **Purpose:** Turn raw metrics into plain-language business insights for non-technical owners: "sales up 12% W/W, driven by beverages; 3 SKUs trending; cart abandonment rising on mobile."
- **Inputs:** Aggregated analytics (orders, GMV, traffic, GA4, conversion, cohort/retention) — pre-aggregated in code, never raw row dumps.
- **Outputs:** Narrative insight cards, anomaly callouts, recommended actions (links to other agents). **Read-only.**
- **Preferred:** Anthropic `claude-sonnet-4-6`. **Fallback:** `gpt-4.1`.
- **Guardrails:** numbers come from the warehouse, not the LLM (LLM narrates, never computes totals); no fabricated stats; tenant-scoped data only.
- **Human-in-the-loop:** No gate (read-only insights), but recommended actions route to gated agents.
- **Hands off to:** Marketing, Inventory, Pricing Agents (suggested actions).

## 11. Google Agent

- **Purpose:** Orchestrate Google ecosystem sync (P4): Merchant Center product feeds (Merchant API v1, **never** Content API), GA4 setup, Search Console sitemaps, Business Profile, Tag Manager, Maps geocoding — mapping AICOS catalog to each API's schema and resolving disapprovals.
- **Inputs:** Catalog/SEO records, tenant `OAuthConnection` (per-tenant granted scopes, encrypted tokens, merchantId/ga4PropertyId/etc.), Merchant Center disapproval reasons.
- **Outputs:** Sync plans + field-mapped payloads (`amountMicros` int64 prices), disapproval remediation suggestions, sitemap submission jobs — executed only after approval.
- **Preferred:** Google `gemini-2.5-flash` (Google-domain familiarity, cost). **Fallback:** `claude-sonnet-4-6`.
- **Guardrails:** respects per-tenant granted scopes (consent unbundling — check before invoking, prompt reconnect if missing); Merchant title/desc/GTIN/image quality checks **before** sync (keep disapproval rate <20% or quota increases are denied); idempotent sync; rate-limit/quota aware.
- **Human-in-the-loop:** Yes — first sync and any bulk change owner-approved; ongoing deltas can be auto-synced once approved.
- **Hands off to:** SEO Agent (fix disapproved fields), Marketing Agent (Ads/GA4).

## 12. Compliance Agent

- **Purpose:** Cross-cutting policy/compliance reviewer (P5): scans AI-generated content and product listings for legal/regulatory issues — restricted-category claims (pharmacy/beauty/health), prohibited products, GDPR/PII leakage in generated text, ad-policy violations, trademark misuse, required disclaimers per locale.
- **Inputs:** Any draft about to be published (product, content, SEO, campaign, theme copy), tenant locale/jurisdiction, category, policy ruleset.
- **Outputs:** Compliance verdict `{pass | warn | block}` + cited rule + suggested fix; attached to the draft.
- **Preferred:** Anthropic `claude-opus-4-8` (highest-stakes reasoning, lowest tolerance for error). **Fallback:** `claude-sonnet-4-6`.
- **Guardrails:** conservative bias (false-positive over false-negative); never *approves* on its own — a `pass` is advisory; a `block` **hard-stops** the human publish action until resolved or overridden by an authorized role with logged justification.
- **Human-in-the-loop:** **Advisory + blocking.** Sits in front of the publish gate: a `block` prevents publishing; the owner/admin must fix or formally override (audit-logged).
- **Hands off to:** the originating agent (Content/SEO/Marketing/Product) to remediate.

---

## Agent Interaction Map (flagship onboarding flow)

```
 Video ──▶ Extraction Agent ──▶ Product Agent ──┬──▶ Content Agent ──┐
                                                 ├──▶ SEO Agent ──────┤
                                                 └──▶ Pricing Agent ──┤
                                                                      ▼
                                                          Compliance Agent (pass/warn/block)
                                                                      ▼
                                                      ┌──────────────────────────┐
                                                      │  HUMAN REVIEW + PUBLISH   │  ◀── the only path to live data
                                                      └──────────────────────────┘
                                                                      ▼
                                                   Google Agent (Merchant/GA4/sitemap sync)
```

Post-launch growth loop: Analytics Agent → (Marketing / Inventory / Pricing) Agents → drafts → human approve → live. Customer Service Agent runs continuously on the storefront, escalating to humans on anything risky.
