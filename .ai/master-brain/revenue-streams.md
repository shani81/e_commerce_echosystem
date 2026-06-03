# AICOS — Revenue Streams

> **Product:** AI Commerce OS (AICOS)
> **Document status:** Phase 0 (Planning)
> **Last updated:** 2026-06-03

Maps each revenue stream from the project spec to the modules and phases that deliver it. **Build-status is "Planned, 0%" for everything — this is Phase 0.**

---

## 1. Revenue Stream Overview

| # | Stream | Type | Status | Unlocks in | Primary modules |
|---|---|---|---|---|---|
| 1 | Tiered SaaS subscriptions (Starter/Growth/Pro/Enterprise) | Recurring | **Current (core)** | P0 → P1 | `billing`, `iam` |
| 2 | AI usage credits (extraction minutes + generation credits) | Metered/usage | **Current (core)** | P2 | `billing`, `ai-core`, `ai-extraction`, `content` |
| 3 | Optional low % transaction fee on GMV | Usage/commerce | **Current** | P1 | `payments`, `orders`, `billing` |
| 4 | White-label / agency licensing | Recurring + channel | **Current (later phase)** | P5 | `iam`, `admin`, `theme-engine`, `billing` |
| 5 | Add-on integrations marketplace | Marketplace/take-rate | **Current (later phase)** | P4 → P5 | `automation`, `google`, `notifications`, `billing` |
| 6 | Theme/template marketplace | Marketplace/take-rate | **Future** | P3+ | `theme-engine`, `store-builder` |
| 7 | Domain & hosting reseller | Reseller margin | **Future** | P4+ | `store-builder`, `google` |
| 8 | Done-for-you onboarding services | Services | **Future** | P2+ | `ai-extraction`, `content`, `admin` |

---

## 2. Current Streams (detail)

### Stream 1 — Tiered SaaS Subscriptions *(the recurring base)*
- **What:** Starter $29 / Growth $79 / Pro $199 / Enterprise (custom) per month, annual billing (see `business-model.md`). A Free tier (≤20 SKUs, 1 extraction) is the acquisition funnel.
- **Modules:** `billing` (SaaS Subscription Billing, P0), `iam` (entitlements/seats/tenancy, P0).
- **Phase:** Billing skeleton in **P0**; tiers go live when the **P1** commerce MVP makes a store sellable.
- **Rail:** Stripe Billing (0.7% fee, raised June 2025); `automatic_tax` from day one; metered add-ons provisioned in P0 even before credits enable in P2.
- **Strategy:** priced to remove price as a switching barrier; expansion happens via Streams 2 & 3, not seat-stuffing.

### Stream 2 — AI Usage Credits *(the expansion engine)*
- **What:** Extraction minutes + generation credits, bundled per tier with high-margin overage ($1.50/extraction, $5/1,000 credits) and non-expiring credit packs.
- **Modules:** `ai-core` (provider abstraction + `ai.usage` events), `ai-extraction` (flagship video-to-catalog), `content` (descriptions/SEO/pages), `billing` (real-time credit deduction).
- **Phase:** **P2** (the Magic). Billing infra ready in P0.
- **Unit economics:** ~$0.10–$0.15 AI cost per 5-min video → 3–13× margin; ≥75% structural gross margin (see `business-model.md` §3).
- **Strategy:** denominated in user-facing units so a non-technical owner understands it; provider swaps change our COGS, never the customer's price. Per-tier Redis guards + BullMQ limiter prevent cost bombs.

### Stream 3 — Optional Low % Transaction Fee on GMV
- **What:** 1.0% (Starter) → 0.5% (Growth) → 0% (Pro/Enterprise) of commerce GMV.
- **Modules:** `payments` (Stripe Connect destination charges, `application_fee_amount`), `orders`, `billing`.
- **Phase:** **P1** (when stores start transacting).
- **Strategy:** aligns AICOS revenue with tenant success; **pure margin on top of subscription**; the fee tapers to 0% on higher tiers as subscription value grows, incentivizing upgrades. Note chargeback/refund liability sits on the platform for destination charges — reserves and a dispute workflow required.

### Stream 4 — White-Label / Agency Licensing
- **What:** Agencies/resellers run AICOS under their own brand for their clients; recurring license + per-tenant or revenue-share model.
- **Modules:** `iam` (reseller role + sub-tenant hierarchy), `admin`, `theme-engine` (branding), `billing` (reseller billing & rev-share).
- **Phase:** **P5** (Scale & Enterprise), included in Enterprise tier / add-on at Pro.
- **Strategy:** turns AICOS into a platform others build businesses on; channel leverage into SMB segments (and geographies) we cannot reach directly.

### Stream 5 — Add-on Integrations Marketplace
- **What:** Take-rate / listing fees on third-party and first-party integrations (ads platforms, carriers, accounting, etc.).
- **Modules:** `automation` (engine to host/run integrations), `google`, `notifications`, `billing` (metering & payouts).
- **Phase:** **P4 → P5**.
- **Strategy:** ecosystem flywheel; BigCommerce's open API is the most tractable incumbent connector path for a future B2B/agency channel.

---

## 3. Future Streams (detail)

### Stream 6 — Theme/Template Marketplace
- **What:** Creators sell themes/templates; AICOS takes a percentage.
- **Modules:** `theme-engine` (AI Theme Generation), `store-builder`.
- **Phase:** **P3+**. AI theme generation is the closest analog to Shoplazza's text-prompt store builder — a marketplace layers on top once theming is live.

### Stream 7 — Domain & Hosting Reseller
- **What:** Resell domains + managed hosting/CDN at margin; one-click "buy your domain inside AICOS."
- **Modules:** `store-builder`, `google` (Search Console/sitemaps), infra/CDN.
- **Phase:** **P4+**.

### Stream 8 — Done-for-You Onboarding Services
- **What:** Paid concierge: AICOS staff/partners film or refine a store's catalog for the owner.
- **Modules:** `ai-extraction`, `content`, `admin`.
- **Phase:** **P2+**. High-touch upsell for owners unwilling/unable to film (also a privacy-concern fallback alongside the photo-batch path).

---

## 4. Revenue Mix Evolution (planning view)

| Phase | Dominant revenue | Emerging |
|---|---|---|
| **P0–P1** | Subscriptions + GMV fee | — |
| **P2** | Subscriptions + **AI credits** | Done-for-you onboarding |
| **P3** | Subscriptions + AI credits | Theme marketplace |
| **P4** | + Integrations marketplace, Google-driven GMV growth | Domains/hosting |
| **P5** | + **White-label/agency** at scale | Enterprise/compliance deals |

**Trajectory:** start subscription-led, become **usage-led** (AI + GMV) as stores grow, then **ecosystem-led** (marketplace + white-label) at scale — each layer compounding net revenue retention above 100%.

---

## 5. Guardrails

- **AI streams must always be margin-positive** — telemetry (`ai.usage`) + credit guards are non-negotiable.
- **GMV fee tapers to 0%** on higher tiers by design; do not reintroduce it as a hidden cost.
- **Marketplace take-rates** must not undercut the integrations that drive tenant retention; price for ecosystem growth, not short-term extraction.
- **Free tier is a cost center by design** — capped at 1 lifetime extraction; treat its cost as CAC, not COGS leakage.
