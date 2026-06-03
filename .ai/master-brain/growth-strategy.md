# AICOS — Growth Strategy

> **Product:** AI Commerce OS (AICOS)
> **Document status:** Phase 0 (Planning)
> **Last updated:** 2026-06-03

---

## 1. Growth Thesis

**The product is the growth engine.** A non-technical owner going from physical store to live, selling storefront in **< 15 minutes** is a demonstrable "jaw-drop" moment that nobody else can deliver. Our growth strategy is to **engineer that moment into a viral, low-CAC funnel**, then **expand revenue automatically as stores succeed**, then **scale reach through channels (agencies, geographies, marketplace)**.

Three compounding loops:
1. **Acquisition loop** — free trial of the magic → published store → word-of-mouth.
2. **Expansion loop** — store grows → more AI usage + GMV + agents → higher net revenue retention.
3. **Ecosystem loop** — agencies, themes, integrations bring tenants and stickiness at scale.

---

## 2. Phase-Aligned Growth Plan

| Phase | Growth focus | Key plays |
|---|---|---|
| **P0–P1** | Prove the wedge; design-partner stores | Hand-recruit 20–50 SMBs across verticals (grocery, fashion, beauty, electronics); obsess over TTLS and accuracy; English-first |
| **P2** | Launch the magic publicly | Free tier (1 extraction, ≤20 SKUs); demo-video-led marketing; WooCommerce-import migration funnel; top-5 language i18n |
| **P3** | Store-builder virality | "Generate a store from a name" + AI themes lower the bar further; theme marketplace seeds creators |
| **P4** | Traffic & intelligence | Google ecosystem sync drives discoverability; AI agents (marketing/CS/pricing) raise stickiness & expansion |
| **P5** | Channel scale | White-label/agency program; integrations marketplace; multi-region into SE Asia / MENA / LATAM |

---

## 3. Acquisition Strategy

### 3.1 Product-Led Growth (primary)
- **Free tier is the funnel, not a courtesy.** Ecwid's free plan set the market expectation; the non-technical persona will not pay before seeing results. 1 lifetime "wow" extraction (≤20 SKUs) gets them to the magic moment, then converts to paid for more.
- **Time-to-value is the conversion lever.** Every minute shaved off TTLS lifts onboarding completion (target ≥40% free, ≥70% paid).
- **The magic moment is inherently shareable** — a store live in 15 minutes is content owners *want* to show off.

### 3.2 Demo-Led Content
- The extraction demo (film shelves → catalog appears) is the single most powerful marketing asset. Lead every channel with it. It also answers the trust objection by showing the **human review gate** on screen.

### 3.3 Migration Funnel (high-intent)
- **WooCommerce's 40–200 hour setup** has created a large pool of frustrated/abandoned store owners — **ideal migration candidates.** Ship a **WooCommerce import** path (P1/P2) and target this audience directly with "we'll rebuild your store from a video in minutes."
- Position Shopify Magic/Sidekick as **complementary, not competing** (they generate from data you typed; we generate the data) to convert Shopify-curious owners rather than antagonize them.

### 3.4 Geographic Reach (structural advantage)
- True TAM is the **millions of offline SMBs** in SE Asia, MENA, and LATAM. Meilisearch's native **Arabic/Thai/CJK** indexing is a structural advantage incumbents lack. Sequence: English-first launch → top-5 language i18n (P2/P3) → localized currencies/payment methods.

### 3.5 Channel: Agencies (P5)
- White-label lets agencies onboard portfolios of SMB clients — a force-multiplier into segments and geographies we can't reach directly.

---

## 4. Activation & Conversion

| Funnel stage | Metric | Target | Lever |
|---|---|---|---|
| Visit → Signup | Signup rate | — | Demo video, free tier |
| Signup → First extraction | Activation | high | Mobile capture guidance, zero-config |
| Extraction → Publish | **Onboarding completion** | ≥40% free / ≥70% paid | Confidence-driven review UI, low friction |
| Publish → Paid | Conversion | — | SKU/extraction caps on free; "add more by filming" |
| Paid → Expanded | NRR | >100% | AI credits, GMV growth, agents |

**Activation is the battle.** The whole funnel hinges on getting the owner to a *published* store. Review-UX quality (triage by confidence, flag-don't-guess missing prices) is the highest-leverage growth investment after extraction accuracy itself.

---

## 5. Retention & Expansion

- **Stickiness via depth:** once catalog, orders, payments, search, and (later) agents run a store's daily operations, switching cost is high — a full OS, not a single feature.
- **Re-use the magic:** filming new shelves to restock keeps owners returning to the core loop.
- **Expansion is built-in:** AI usage credits and the GMV fee grow with the store; agents (marketing/CS/pricing/inventory) deepen reliance. NRR structurally > 100% for healthy tenants.
- **Trust retention:** zero cross-tenant incidents and ≥95% catalog accuracy keep owners confident.

---

## 6. The Moat (Defensibility) — *why growth compounds*

1. **Execution speed.** Shopify could add video extraction in 12–24 months; we must ship first and build network effects now.
2. **Extraction-accuracy data network effect.** Every verified extraction improves our models and a canonical product-knowledge graph (barcodes → products via Open Food Facts + our corpus). New entrants start from zero accuracy; we compound.
3. **Platform depth.** A third party could clone "extraction" as one app; a full commerce OS is far harder to replicate.
4. **Trust positioning.** The human verification gate, marketed as a feature, owns the AI-trust high ground that slowed incumbents' AI adoption.
5. **Geographic + language reach** incumbents under-serve.

---

## 7. Competitive Threat Response (growth resilience)

| Threat | Response |
|---|---|
| Shopify extends Sidekick to video extraction (12–24 mo) | Ship first; compound accuracy/data moat; own the "film it" verb |
| Google Lens / Shopping adds scan-to-list | Differentiate on **complete operational store**, not a product feed |
| Third-party Shopify extraction app (~18 mo) | Win on platform depth + accuracy, not a single feature |
| Localization gaps early | English-first, fast i18n (P2/P3), Meilisearch multilingual edge |
| Owners won't film (privacy/unfamiliarity) | Photo-batch fallback + done-for-you onboarding at launch |

---

## 8. Growth Guardrails
- **Never sacrifice TTLS for a feature.** Onboarding simplicity is the acquisition engine.
- **Free tier cost is CAC, not leakage** — capped at 1 lifetime extraction; guarded against abuse.
- **Don't out-run trust.** Accuracy and isolation incidents would poison word-of-mouth faster than any campaign could rebuild it.
- **Pace integrations to compliance** (e.g., start Google OAuth verification in P3 — it takes 4–8 weeks — so P4 growth isn't blocked).
