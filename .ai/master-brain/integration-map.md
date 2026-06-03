# AICOS Integration Map

> Every external integration: purpose, owning module, status, cost model, dependencies, and risks.
> **Status in P0 = `Planned` for all.** Costs/risks are derived from the research digest and are decision-grade.
> Golden rule: **no module imports a third-party SDK directly** except through its owning adapter; **all AI calls route through `packages/ai-core`**.

---

## 1. AI providers (behind `ai-core` abstraction)

| Integration | Purpose in AICOS | Owner | Phase | Status | Cost model | Key risks |
|---|---|---|---|---|---|---|
| **Anthropic Claude** | Default provider; **fallback** for low-confidence (<0.6) extraction frames; high-quality content/SEO. Model: Claude Sonnet 4.6 vision. | `ai-core` | P2 | Planned | $3.00/M input tok; ~$0.0047 per 1080p frame (capped 1,568 tok). | Cost > Gemini 10×; reserve for fallback only. Schrems II TIA required for EU. |
| **Google Gemini** | **Primary** high-volume extraction first-pass (Gemini 2.5 Flash, batch-8 frames per call); large context for multi-frame video. | `ai-core` | P2 | Planned | $0.30/M input tok; ~$0.00047 per frame; Flash-Lite $0.10/M for pure OCR. | **Model-version churn** (2.0 Flash shut down Jun 2026). Pin `gemini-2.5-flash`; keep fallback model ID in config. Rate-limit 429s at scale. |
| **OpenAI** | Third provider in the swap chain; optional content generation; future model diversity. | `ai-core` | P2 | Planned | GPT-4.1 recommended (GPT-4o now legacy as of Jun 2026); $2.50/M input. | Keep as alternative, not default. Cost parity with Claude. |
| **ZXing + Open Food Facts** | Zero-LLM barcode decode pre-step; auto-fills 20–40% of grocery/FMCG products free. | `ai-extraction` | P2 | Planned | **$0** (Apache-2.0 lib + free OFF API). | OFF coverage gaps for non-grocery; falls through to LLM pass. |

**Provider strategy:** Gemini Flash first-pass → Claude Sonnet fallback on confidence < 0.6 or 429. Per-video AI cost ≈ **$0.10–$0.15** (5-min 1080p, ~70 products). Charge $0.50–$2.00/extraction → 3–13× margin.

---

## 2. Money (Stripe — two parallel flows)

| Integration | Purpose | Owner | Phase | Status | Cost model | Key risks |
|---|---|---|---|---|---|---|
| **Stripe Billing** | Platform SaaS subscriptions (Starter/Growth/Pro/Enterprise) + metered AI credits. | `billing` | P0 (provision) / P2 (credits) | Planned | **0.7%** of billing volume (raised Jun 30 2025). ~$7k/yr at $1M ARR. | 0.7% on all volume — negotiate flat plan at scale. Provision in P0 even if credits off. |
| **Stripe Connect** | Route buyer funds to tenant stores; **destination charges**; app fee = AICOS revenue. Accounts v2 (`/v2/core/accounts`). | `payments` | P1 | Planned | Stripe-managed mode: **no** per-account/per-payout platform fee; earn via `application_fee_amount`. | Accounts v2 launched Dec 2025 — SDK may lag; pin `2026-01-28.clover`. **Chargeback liability on platform** for destination charges → build dispute evidence before Go Live. Refunds debit platform balance → reserve requirements. |
| **Stripe Tax** | Automatic sales tax / VAT on Checkout + Subscriptions. | `payments`/`billing` | P1 | Planned | 0.5% taxable volume (no-code) or $0.05/Calculation API call. | Enable `automatic_tax` day one; register jurisdictions as tenant base grows. |
| **Stripe Checkout (embedded)** | Storefront payment UI; SCA/3DS, promo codes, shipping address, destination routing in one session. | `payments` | P1 | Planned | Standard Stripe processing fees (tenant-borne). | `rawBody:true` in NestJS bootstrap or webhook HMAC breaks forever. Promo `coupon` field polymorphic since Sep 2025 ('clover'). |

---

## 3. Shipping & fulfillment

| Integration | Purpose | Owner | Phase | Status | Cost model | Key risks |
|---|---|---|---|---|---|---|
| **Shippo** | Default aggregator (P1): 40+ carriers incl. **Bring** (Nordic critical). Rates, labels, tracking. | `shipping` | P1 | Planned | $0/mo base; 30 free labels/mo; **$0.07/label**; addr validation $0.02 US/$0.08 intl. | Above ~50k labels/mo, EasyPost ($0.03–0.05) is cheaper → plan migration/Premier pricing. Label URLs expire → cache to S3/R2. |
| **PostNord (direct API)** | Full Nordic coverage (DK/SE/NO/FI) behind same `ShippingProvider` interface. Shipment v3 Booking API. | `shipping` | P2 | Planned | Carrier account pricing; **legacy EDI deprecated** (SE surcharges Mar 2026). | Must use Shipment v3, not EDI. NO/SE tenants depend on this. |
| **EasyPost** | _Not chosen for P1._ Candidate high-volume migration target (BYOCA). | `shipping` | (eval) | Planned | 3,000 free labels; $0.03–0.05/label after; BYOCA $20/mo. | **PostNord & Bring absent from Wallet catalog** → would force direct carrier work immediately. Reason it's not the P1 default. |

---

## 4. Google ecosystem (Phase P4 — eight API families, separate approval gates)

| Integration | Purpose | Owner | Phase | Status | Cost model | Key risks |
|---|---|---|---|---|---|---|
| **Google OAuth** | Per-tenant consent; **partial-grant aware** (consent unbundling May 2025). Stores `granted_scopes[]`. | `google`/`iam` | P3 (verify) / P4 | Planned | Free. Verification 4–8 wks (sensitive). | **Refresh tokens expire 7d for unverified apps** → add ≤100 beta testers as test users. Submit verification in **P3**, not P4. |
| **Merchant API v1** | Product feed to Google Shopping. AICOS as MCA with per-tenant sub-accounts. | `google` | P4 | Planned | Free API; prices use `amountMicros` int64. | **Content API shuts down Aug 18 2026 — hard deadline.** Build v1 only, never Content API. >20% product disapproval blocks quota increases → quality-gate AI-extracted data. |
| **Google Business Profile (GBP)** | Local presence, hours, posts. Single scope `business.manage`. | `google` | P4 | Planned | Free. 0 QPM until approval (3–10 biz days) → 300 QPM. | Needs AICOS's own verified GBP **60+ days** old → create company GBP **now**. Frame app as agency/SaaS w/ per-owner consent (avoid bulk-spam rejection). Q&A API gone Nov 3 2025. |
| **GA4 (Measurement Protocol v2)** | Server-side purchase/order events from NestJS. | `google`/`analytics` | P4 | Planned | Free. **No OAuth** — API secret only. | Secret leak → fake revenue injection. Store encrypted server-side, rotate. Pass browser `_ga` client_id for attribution. |
| **GA4 Admin API** | Auto-create GA4 property + data stream per tenant. | `google` | P4 | Planned | Free. Scopes `analytics.edit`/`.provision` (sensitive). | Verification required. |
| **Google Search Console** | Sitemap submission (primary indexing strategy), URL inspection (newly published only). | `google` | P4 | Planned | Free. URL Inspect 600/day/property, 2,000/day/project. | Use sitemaps, **not** Indexing API (abuse-flagged May 2025). Auto-submit via BullMQ after publish. |
| **Google Tag Manager** | One-click tracking: create container, install GA4 + conversion tags, publish. | `google` | P4 | Planned | Free. Needs **both** `tagmanager.edit.containers` + `tagmanager.publish`. | Request both scopes in consent screen up front. |
| **Google Maps Platform** | Onboarding geocoding (1 call/tenant) + store-locator map. | `google` | P4 | Planned | Maps JS API **free unlimited**; Geocoding 10k free/mo then $5/1k; Places Nearby 5k free then $32/1k. | Maps JS key in frontend → **HTTP referrer restrictions mandatory** or abuse charges. Server keys → IP restrictions. |
| **Google Ads API** | Paid-search campaign sync (via `marketing`). | `marketing`/`google` | P4-late/P5 | Planned | Free API; **restricted scope** → annual 3rd-party audit (~$5k–30k/yr) + dev token approval (1–4 wks). | Most compliance-heavy. **Defer to late P4/P5.** Budget audit as recurring cost. |

---

## 5. Ad channels (Phase P4, via `marketing`)

| Integration | Purpose | Owner | Phase | Status | Cost model | Key risks |
|---|---|---|---|---|---|---|
| **Meta Ads** | Campaign creation + catalog sync to FB/IG. | `marketing` | P4 | Planned | API free; ad spend tenant-borne. | OAuth + app review; catalog feed format mapping. |
| **TikTok Ads** | Short-video commerce campaigns. | `marketing` | P4 | Planned | API free; ad spend tenant-borne. | App review; creative requirements. |
| **Pinterest Ads** | Visual-discovery campaigns. | `marketing` | P4 | Planned | API free; ad spend tenant-borne. | Lower priority of the three. |
| **Google Ads** | _See Google section_ — restricted scope. | `marketing` | P4-late/P5 | Planned | See above. | Audit gate. |

---

## 6. Core infrastructure integrations

| Integration | Purpose | Owner | Phase | Status | Cost model | Key risks |
|---|---|---|---|---|---|---|
| **Cloudflare R2** (prod storage) | Object storage; videos, frames, images, label cache. **$0 egress.** | `media` | P1 (abstraction) | Planned | $0.015/GB/mo storage, **$0 egress** (vs S3 $0.085/GB after 10TB → R2 saves ~$850/mo at 10TB); free 10GB. EU/US jurisdiction lock (Jan 2026). | Multipart 10MB chunks. `temp/` prefix needs 48h lifecycle (300+ JPEGs/video). |
| **AWS S3** (prod alt) | S3-compatible alternative / multi-cloud. | `media` | P1 | Planned | $0.023/GB/mo + egress. | Egress cost vs R2; choose R2 as default. |
| **MinIO** (dev) | Local S3-compatible parity. Ports 9200/9300. | `media` | P0 | Planned | $0 (self-host). | Dev only; same SDK path as prod. |
| **Meilisearch** | Full-text/faceted product search; tenant-token isolation. | `search` | P1 | Planned | Self-host **free** unlimited; cloud Build $30/mo. | **10-word query hard limit** → inform users/split. Master key never to frontend — tenant tokens (1h TTL, `tenant_id` filter) only. |
| **Email: SMTP / SendGrid** | Transactional + lifecycle email. Mailhog in dev (8100/1200). | `notifications` | P1 | Planned | SendGrid tiered; Mailhog $0 dev. | Per-tenant sender identity, SPF/DKIM in prod. |
| **Doppler** (secrets) | Secrets across Docker Compose (dev) + K8s (prod), zero code change. | Platform | P0 | Planned | Team $10/user/mo. | Add trufflehog pre-commit day one. |

---

## 7. Integration risk heatmap (top hard deadlines & blockers)

| Risk | Likelihood | Impact | Mitigation | Latest action date |
|---|---|---|---|---|
| **Content API for Shopping shutdown** | Certain | High | Build **Merchant API v1 only** from day one | **Aug 18 2026** (hard) |
| **Google OAuth verification delay** (4–8 wks) | High | High | Submit in **P3**; ≤100 test users; video demo | Start P3 |
| **GBP 60-day requirement** | Certain | Medium | Create AICOS company GBP **immediately** | Now |
| **Stripe webhook rawBody corruption** | High if unguarded | High | `rawBody:true` at bootstrap; no JSON middleware on webhook route | P1 |
| **AI cost bomb** (compromised acct → $5k/hr) | Medium | High | AiCreditGuard (Redis) + BullMQ limiter `{max:10,duration:60_000}` + NestJS Throttler | P2 (build P1 infra) |
| **Gemini model deprecation** | Medium | Medium | Pin model ID + config fallback; route through `ai-core` | P2 |
| **Stripe chargeback liability** (destination charges) | Medium | High | Dispute-evidence workflow; per-tenant reserves for high-risk categories | P1 |
| **Maps/GA4 key leakage** | Medium | Medium | Referrer/IP restrictions; encrypted server-side secret; rotation | P4 |

---

## 8. Integration → owning module quick index
`ai-core`: OpenAI, Anthropic, Gemini · `ai-extraction`: ZXing/OpenFoodFacts · `billing`: Stripe Billing/Tax · `payments`: Stripe Connect/Checkout/Tax · `shipping`: Shippo, PostNord, (EasyPost eval) · `media`: R2/S3/MinIO · `search`: Meilisearch · `notifications`: SMTP/SendGrid · `google`: GBP, Merchant v1, GA4, GSC, GTM, Maps, Google OAuth, Google Ads · `marketing`: Meta/TikTok/Pinterest/Google Ads · Platform: Doppler.
