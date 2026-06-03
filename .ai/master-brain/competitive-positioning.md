# AICOS — Competitive Positioning

> **Product:** AI Commerce OS (AICOS)
> **Document status:** Phase 0 (Planning)
> **Last updated:** 2026-06-03
> Source: competitor research digest (2026 pricing & feature landscape).

---

## 1. Positioning Statement

> **For non-technical physical-store owners who have no online store because setup takes weeks, AICOS is the AI commerce OS that builds your catalog from a video of your shelves and gets you selling in under 15 minutes — with you, not the AI, deciding what goes live.**
>
> Unlike Shopify, Wix, BigCommerce, WooCommerce, Squarespace, Ecwid, and Shoplazza — all of which require you to type your catalog in first — AICOS inverts the AI: it *extracts* catalog data from the physical world instead of *generating* content from data you already entered.

**Category:** We are not "another store builder." We are creating a category — **video-to-catalog commerce onboarding** — and own a complete commerce OS behind it.

---

## 2. The Universal Blind Spot (our wedge)

Every major platform requires manual catalog entry before a store can go live. For a 100-SKU non-technical owner that is:

| Platform | Setup time (100 SKUs, non-technical) |
|---|---|
| Shopify | 20–50 focused hours / 2–4 weeks |
| WooCommerce | 40–200 hours / 4–12 weeks |
| Wix / Squarespace / BigCommerce / Ecwid / Shoplazza | days-to-weeks, all manual catalog |
| **AICOS** | **< 15 minutes (film → review → publish)** |

**Every AI feature in the market runs downstream of catalog creation** — it generates descriptions from data you typed. **None can extract catalog data from physical inventory.** AICOS occupies this **completely uncontested territory**.

---

## 3. Competitor Landscape & AICOS's Angle

| Competitor | 2026 pricing (entry e-comm) | Their AI | AICOS angle |
|---|---|---|---|
| **Shopify** | Basic $39/mo ($29 annual); Grow $105; Advanced $399; Plus ~$2,300+ | Sidekick (Jan 2025) conversational mgmt; Magic 2026 brand-voice cloning — **generates from your data, no extraction** | Complementary at AI layer; we generate the data they generate from. Win on onboarding + price |
| **Wix** | Light $17; Core $29; Business $39; Elite $159 | Harmony (Jan 2026): single-prompt full site in ~60s — **design shell only; catalog still manual** | We fill the catalog Harmony leaves empty |
| **BigCommerce** | Standard $39; Plus $105; Pro $399; zero txn fees | — | Most tractable open-API connector for future B2B/agency channel (P4+) |
| **WooCommerce** | $200–$15,000+/yr (hosting+plugins+dev) | plugin-dependent | **Primary migration target** — large pool of frustrated/abandoned owners |
| **Squarespace** | Basic $16; Core $23; Plus $39; Advanced $99 | design-centric | Win on commerce depth + extraction |
| **Ecwid** | Free forever; Starter ~$5; Venture ~$25–30 (100-product cap); Unlimited $99 | — | Their free plan sets the expectation we must match; we beat them on the magic |
| **Sellfy** | $29 / $79 / $159; digital-first; 0.10% share | — | Not a direct threat; signals zero-friction expectation we match for physical goods |
| **Shoplazza** | ~$28–$39; PCI DSS L1; AI Store Builder from **text prompts** (no video) | text-prompt storefront | Closest analog to our P3 store builder — **monitor quarterly for any video/image extraction announcement** |

**AI video tool ecosystem (Runway, Creatify, Keevx, Tolstoy):** all run **catalog → video** (generation). AICOS runs **video → catalog** (extraction) — **directionally opposite, uncommon territory.**

---

## 4. Differentiation Pillars

1. **The inversion (the moat).** Video-to-catalog extraction for physical retail — no incumbent or AI-native startup offers it. This is a category-level innovation, not an increment.
2. **Time-to-value, not price.** Weeks → minutes. We compete on TTLS; price merely removes the barrier.
3. **Human verification gate as a *feature*.** It directly addresses the AI-trust concern that slowed Shopify Magic and Wix Harmony adoption. We market it proactively, never as a caveat.
4. **A full commerce OS, not a feature.** Depth (catalog, inventory, orders, payments, shipping, search, marketing, analytics, agents) is what a third-party "extraction app" can never match.
5. **Reach incumbents under-serve.** Native multilingual search (Meilisearch: Arabic/Thai/CJK) and the 78%-of-retail physical SMB TAM in SE Asia/MENA/LATAM.

---

## 5. Pricing Positioning

| Decision | Rationale (from research) |
|---|---|
| **Starter $29/mo (annual)** | At/below Shopify Basic annual — **eliminates price as a switching barrier** given vastly superior onboarding |
| **Meaningful Free tier (1 extraction, ≤20 SKUs)** | Strategically necessary; Ecwid set the expectation; non-technical persona won't pay before seeing results |
| **GMV fee tapers 1.0% → 0%** | Aligns with success; pushes upgrades; BigCommerce-style "low/zero txn fee" expectation respected on higher tiers |
| **Metered AI credits** | Turns the magic into high-margin expansion (3–13× over API cost), not a subsidy |

(Full table in `business-model.md`.)

---

## 6. Objection / Trust Handling

| Objection | Position |
|---|---|
| "AI will hallucinate prices/SKUs" | **True for any AI — that's why we built the human gate.** It's marketed as the feature. Confidence scores + flag-don't-guess on missing prices |
| "I don't want to film my shop" | **Photo-batch fallback** + done-for-you onboarding at launch |
| "I'm already on Shopify" | We're **complementary** — keep Shopify if you want; we're for getting (and keeping) you online faster and cheaper. Migration path provided |
| "Will my data leak to other stores?" | Hard DB-level isolation (PostgreSQL RLS + `tenant_id`, FORCE RLS); zero-incident commitment |

---

## 7. Threats & Defense

| Threat | Likelihood | Defense |
|---|---|---|
| Shopify adds video/image extraction to Sidekick | 12–24 mo | **Ship first; compound the accuracy/data network effect** they can't retroactively acquire |
| Google Lens/Shopping native scan-to-list | medium | Deliver a **complete operational store**, not just a product feed |
| Third-party Shopify extraction app | ~18 mo | **Platform depth + accuracy** moat; a single feature can't match an OS |
| Privacy reluctance to film | medium | Photo-batch + concierge fallbacks at launch |
| Localization gaps early | real | English-first, fast i18n (P2/P3); Meilisearch multilingual edge |
| Shoplazza adds video extraction | watch | **Quarterly monitoring**; our depth + verification gate + reach still differentiate |

---

## 8. Watch-List (review quarterly)
- **Shoplazza** — any announcement of video/image-based extraction (closest analog to our P3).
- **Shopify Sidekick/Magic** — extraction direction additions.
- **Google Lens / Shopping** — scan-to-list features.
- **Shopify app ecosystem** — third-party extraction apps.

**Primary defense across all of them: execute fast, compound extraction accuracy as a data moat, and stay a full OS — not a feature.**
