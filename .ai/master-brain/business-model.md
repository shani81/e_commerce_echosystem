# AICOS — Business Model

> **Product:** AI Commerce OS (AICOS)
> **Document status:** Phase 0 (Planning)
> **Last updated:** 2026-06-03
> Pricing currency: **USD/month**, billed annually unless noted. All figures are planning targets.

---

## 1. Business Model Summary

AICOS is a **multi-tenant B2B SaaS** with a **usage-metered AI layer** on top of a recurring subscription base, plus optional **commerce-volume monetization** and **ecosystem/partner revenue**.

We make money five ways (detail in `revenue-streams.md`):
1. **Tiered SaaS subscriptions** (Starter / Growth / Pro / Enterprise) — the recurring base.
2. **AI usage credits** (extraction minutes + generation credits) — metered, pass-through-plus-margin.
3. **Optional low % transaction fee on GMV** — aligns our revenue with tenant success.
4. **White-label / agency licensing** — channel and platform leverage.
5. **Add-on integrations marketplace** (+ future theme marketplace, domains/hosting reseller, done-for-you onboarding).

The strategic shape: **win the customer cheaply via a magic onboarding wedge, monetize expansion via AI usage and GMV as the store grows.** Subscription is the floor; AI credits and transaction fees are the expansion engine.

---

## 2. Pricing Table (4 Tiers + Free)

> Designed against 2026 competitor pricing. **Starter is at/below Shopify Basic ($29/mo annual)** to remove price as a switching barrier. A **meaningful Free tier is mandatory** — the non-technical persona will not pay before seeing results (Ecwid's free plan set this expectation).

| | **Free** | **Starter** | **Growth** | **Pro** | **Enterprise** |
|---|---|---|---|---|---|
| **Price (annual, /mo)** | $0 | **$29** | **$79** | **$199** | **Custom** (from ~$599) |
| **Price (monthly)** | $0 | $39 | $99 | $249 | Custom |
| **Target** | Try-before-buy; <20 SKUs | Solo owner, single store | Growing SMB | Multi-staff / multi-location | Chains, agencies, white-label |
| **Products (SKUs)** | 20 | 1,000 | 10,000 | 50,000 | Unlimited |
| **AI extraction minutes / mo** | 5 (≈1 video) | 30 | 120 | 400 | Custom (pooled) |
| **AI generation credits / mo** | 50 | 1,000 | 5,000 | 20,000 | Custom |
| **Staff seats** | 1 | 2 | 5 | 15 | Unlimited / SSO |
| **Stores / locations** | 1 | 1 | 1 | 5 | Unlimited |
| **Transaction fee on GMV** | n/a | 1.0% | 0.5% | 0% | 0% / negotiated |
| **Search (Meilisearch)** | Basic | ✓ | ✓ | ✓ + synonyms | ✓ + dedicated |
| **AI Store Builder (P3)** | – | – | ✓ | ✓ | ✓ |
| **AI agents (marketing/CS/pricing, P4)** | – | – | Marketing | All agents | All + custom |
| **Google ecosystem sync (P4)** | – | Basic (GA4) | Merchant + GBP | Full suite | Full + Ads |
| **White-label / branding removal** | – | – | – | Add-on | ✓ included |
| **Support** | Community | Email | Priority email | Priority + chat | Dedicated CSM + SLA |
| **Data residency (EU/US)** | US | Choice | Choice | Choice | Choice + DPA/SOC2 |

**AI overage pricing (all paid tiers):**
- Extraction: **$1.50 per additional 5-minute extraction** (one video) — margin 10–15× over ~$0.10–$0.15 API cost.
- Generation credits: **$5 per 1,000 additional credits**.
- Credits **do not roll over**; add-on **credit packs** (non-expiring for 12 months) are sold separately for bursty seasons.

**Free-tier guardrails (abuse + cost control):** 1 lifetime "wow" extraction included; subsequent extractions require a paid plan or a credit pack. Per-tier Redis credit guards + BullMQ queue limiters enforce hard ceilings so a single account cannot create an AI cost bomb (a compromised account can otherwise burn $5,000+/hour).

---

## 3. Unit Economics

### 3.1 AI Extraction COGS (the flagship cost driver)
From the AI-extraction research, a **5-minute 1080p walkthrough (~70 products)** costs **~$0.10–$0.15 in AI API fees** end-to-end, via the staged pipeline:

| Stage | Mechanism | Cost impact |
|---|---|---|
| Keyframe extraction | FFmpeg + pHash dedup → 60–100 unique frames | $0 (compute only) |
| Barcode pre-pass | ZXing + Open Food Facts | **$0** — auto-fills 20–40% of grocery SKUs with zero LLM cost |
| First-pass vision | **Gemini 2.5 Flash**, batched 8 frames/call (~10 calls/video) | ~10× cheaper than Claude; primary driver |
| Low-confidence fallback | **Claude Sonnet 4.6** only for frames < 0.6 confidence | small fraction of frames |
| Dedup | CLIP embeddings via pgvector (cosine ≥ 0.92) | $0 (in existing Postgres 16) |

- **Per-product amortized AI cost:** ~$0.0015–$0.002.
- **Latency:** 75–110s with 10 concurrent FrameAnalysisWorkers (sub-3-min target).
- **Cost discipline:** batch 8 frames/call (cuts calls ~8×), pin `gemini-2.5-flash` with config fallback (Gemini 2.0 was deprecated Feb→June 2026 on a 4-month timeline), enforce 1080p min / 20-min max upload (a 15-min video is $0.25–$0.45).

### 3.2 AI Extraction Margin
| Charge model | Tenant pays | AI cost | Gross margin |
|---|---|---|---|
| Included in tier (amortized) | bundled | ~$0.10–$0.15 | structural ≥75% |
| Overage extraction | $1.50 | ~$0.10–$0.15 | **~90%** |
| Pro tier @ 80 videos/mo | bundled | ~$10/mo total | ≥80% |

**The metered AI model is the expansion engine, not a loss leader** — charging $0.50–$2.00 per extraction yields **3–13× margin** over API cost.

### 3.3 Generation Credits COGS
AI content/SEO generation (descriptions, pages, themes, marketing copy) routes through the AI provider abstraction with the same tiered model strategy. A generation credit ≈ one content unit (e.g., one product description or one SEO meta set). Cost per credit is sub-cent at Gemini Flash rates; **$5/1,000 overage** sustains ≥85% margin.

### 3.4 Platform Infrastructure COGS (per tenant, steady-state)
| Component | Choice | Cost note |
|---|---|---|
| Object storage | **Cloudflare R2** (prod) | $0 egress (vs ~$850/mo at 10TB on S3); $0.015/GB/mo storage; temp/ prefix on 48h lifecycle |
| Database | PostgreSQL 16 + RLS, shared schema | ~0.4ms RLS overhead; one migration scales to 100k+ tenants |
| Search | **Meilisearch** self-hosted | free, disk-first, multi-language; frontend queries direct via tenant tokens |
| Cache/queues | Redis + BullMQ | shared; KEDA queue-depth autoscaling for workers |
| Worker compute | separate NestJS `apps/worker` | scales independently for FFmpeg/AI bursts |

Steady-state non-AI infra cost per active tenant is **low single-digit dollars/month**, dominated by storage of product media. AI cost is **variable and metered**, so COGS scales with usage rather than with idle tenants.

### 3.5 Illustrative Contribution Margin (Growth tier, $79/mo annual)
| Line | Monthly |
|---|---|
| Subscription revenue | $79.00 |
| AI extraction COGS (≤120 min ≈ 24 videos) | ~$3.60 |
| AI generation COGS (≤5,000 credits) | ~$3.00 |
| Infra (storage/db/search/queue share) | ~$4.00 |
| Stripe Billing fee (0.7% of sub) | ~$0.55 |
| **Gross profit (sub only)** | **~$67.85 (~86%)** |
| + GMV fee (0.5% on, e.g., $8k GMV) | +$40.00 |

Transaction-fee revenue is **pure margin on top of an already-healthy subscription** and is the reason GMV monetization is strategically important even at a low rate.

---

## 4. AI Cost Pass-Through Model

**Principle: AI is a metered COGS we mark up transparently, never a hidden subsidy.**

1. **Every AI call emits an `ai.usage` event** (`provider`, `model`, token counts) from `packages/ai-core`. The billing module subscribes and **deducts credits from the tenant's balance in real time**. Without this telemetry, AI cost tracking is impossible — so it is a Phase-0/Phase-2 architectural requirement, not an afterthought.
2. **Tiered model routing minimizes cost before markup:** Gemini Flash first pass → Claude fallback only on low confidence; barcode pre-filter avoids LLM entirely for 20–40% of grocery SKUs.
3. **Credits are denominated in user-facing units** (extraction minutes, generation credits) so pricing is intelligible to a non-technical owner, while the system maps units → provider tokens internally. Swapping providers (per the abstraction layer) changes our COGS but **not** the customer's price.
4. **Hard guards prevent cost bombs:** per-tier Redis credit guards + BullMQ queue-level limiter (`{ max, duration }`) + NestJS Throttler. These are treated as **revenue-protecting billing infrastructure**, not optional rate limiting.
5. **Overage and credit packs** convert heavy AI usage into high-margin expansion revenue rather than support tickets.
6. **Stripe Billing metered usage** (`stripe.billing.meterEvents.create()`) is the billing rail; the Billing module is provisioned in Phase 0 even before credits are enabled in Phase 2.

---

## 5. Payments & Money-Flow Economics

AICOS runs **two parallel Stripe money flows**:
- **Platform revenue → Stripe Billing** (subscriptions + metered AI): 0.7% of billing volume (raised June 2025). At $1M ARR this is ~$7k/yr — negotiate a flat plan at volume.
- **Commerce payments → Stripe Connect, destination charges** (`transfer_data.destination` + `on_behalf_of`): buyer funds route to the tenant's connected account; **AICOS earns the optional GMV fee via `application_fee_amount`**. Use **Stripe-managed Connect pricing** in Phase 1 (no per-account/per-payout platform fees) and **Accounts v2** (`/v2/core/accounts`, merchant+recipient configs) for onboarding.
- **Stripe Tax** (`automatic_tax`) on from day one (0.5% taxable volume). **Stripe Checkout embedded** keeps PCI scope at **SAQ A**.

**Risk to capitalize as COGS/liability:** destination-charge **chargebacks land on the AICOS platform**, and destination-charge refunds debit the platform balance — so we maintain a Stripe balance/credit line and **per-tenant reserves for high-risk categories** (electronics, luxury). A dispute-evidence workflow is required before Go Live.

---

## 6. Why This Model Wins

- **Low acquisition friction:** Free tier + $29 Starter removes price as a barrier; the 15-minute wedge does the selling.
- **Built-in expansion:** AI credits + GMV fee grow revenue automatically as the store succeeds — **net revenue retention is structurally > 100%** for healthy tenants.
- **Healthy gross margins:** ≥75% on AI, ~86% on subscription, $0-egress storage — the magic is profitable.
- **Multiple compounding moats:** extraction-accuracy data network effect, full-OS depth, and (later) a marketplace flywheel — see `future-opportunities.md`.
