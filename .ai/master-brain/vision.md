# AICOS — Vision

> **Product:** AI Commerce OS (AICOS)
> **Tagline:** *Film your shelves. Publish your store. In minutes.*
> **Document status:** Phase 0 (Planning) — authoritative strategic source of truth
> **Last updated:** 2026-06-03

---

## 1. Why AICOS Exists

Roughly **78% of U.S. retail still flows through physical stores** (global e-commerce was ~$6.86T in 2025 but is still a minority of total retail), and millions of SMB retailers worldwide have **no online presence at all**. The blocker is not cost, and it is not desire — it is **setup friction**.

Every major e-commerce platform — Shopify, Wix, BigCommerce, WooCommerce, Squarespace, Ecwid, Shoplazza — forces the merchant to **manually build their catalog before the store can exist**. For a non-technical owner with 100 SKUs that is **20–50 focused hours over 2–4 weeks** on the friendliest platform (Shopify), and **40–200 hours over 4–12 weeks** on WooCommerce. The platforms have invested heavily in AI, but **every AI feature in the market today runs in the wrong direction**: it *generates content from catalog data the merchant already typed in* (Shopify Magic/Sidekick, Wix Harmony, Shoplazza AI Store Builder). None of them can **extract catalog data from physical inventory**.

That is the inversion AICOS owns.

**AICOS exists to delete the single hardest step in going online: building the catalog.** A store owner films their shelves, AI extracts the entire catalog — names, prices, variants, images, SEO — the owner reviews and approves, clicks Publish, and a complete operational store goes live. We turn weeks of work into minutes.

---

## 2. North Star

> **A non-technical physical-store owner records a short video of their shelves, uploads it, AI extracts the full catalog (names, prices, variants, images, SEO), the owner reviews, clicks Publish, and a complete operational online store goes live in under 15 minutes.**

Everything we build is measured against this single sentence. If a feature does not move the median **time-to-live-store** down or the **catalog accuracy** up, it is deprioritized.

### North-Star Metric
**Time-to-Live-Store (TTLS):** median minutes from first video upload to a published, transactable storefront for a 100-SKU store.
- **Target at GA:** < 15 minutes.
- **Today's market baseline:** 2–4 weeks (Shopify), 4–12 weeks (WooCommerce).

### Supporting Metrics
| Metric | Definition | Target |
|---|---|---|
| Extraction Auto-Fill Rate | % of product fields AI fills at ≥0.6 confidence with no human edit | ≥ 70% |
| Catalog Accuracy | % of published fields requiring no correction within 7 days | ≥ 95% |
| Onboarding Completion | % of signups that publish a store | ≥ 40% (free), ≥ 70% (paid) |
| AI Gross Margin | (extraction price − AI API cost) / extraction price | ≥ 75% |

---

## 3. The Core Insight (Our Wedge)

The market has converged on AI for the **storefront and marketing layers** — downstream of catalog creation. **Nobody has inverted the AI video direction from content-generation to catalog-extraction.** The video-to-catalog onboarding workflow (Phase 2, the AI Product Extraction Engine — our flagship) occupies **completely uncontested market territory**.

This is not an incremental improvement on store builders. It is a **category-level innovation**: the first commerce platform where *the catalog builds itself from the physical world.*

**The wedge is onboarding. The platform is everything after.** We win the customer with a magic 15-minute launch, then keep them with a full commerce OS (inventory, orders, payments, shipping, marketing, analytics — all AI-assisted).

---

## 4. What AICOS Is (Scope)

AICOS is a **general-purpose, multi-tenant e-commerce operating system** for *any* physical store — grocery, fashion, electronics, pharmacy, beauty, furniture, and more. It is explicitly **not** restaurant-specific (the code baseline uses restaurant examples; the proposal governs scope and overrides them).

It is **AI-first, mobile-first, minimalist, and zero-setup by design**. AI does the work; humans verify and approve. **Nothing AI-generated ever publishes automatically** — a human verification gate is a non-negotiable architectural and product principle.

---

## 5. 3–5 Year Vision

### Year 1 — *"The Magic Works"* (Phases 0–2)
Ship the foundation (IAM, multi-tenancy, billing) and core commerce MVP (catalog, inventory, orders, Stripe payments, shipping, storefront, admin, search), then deliver the flagship: **video-to-catalog extraction with a human verification gate** plus AI content/SEO generation. By end of Year 1 a real store owner can film, review, publish, and **sell** in under 15 minutes. We own a defensible, uncontested onboarding wedge and begin compounding an **extraction-accuracy data moat**.

### Year 2 — *"The Store Builds Itself"* (Phases 3–4)
**AI Store Builder** (generate a full store from a name), **website-cloning for visual inspiration**, and **dynamic AI theme generation** remove the last manual design step. Then **Growth & Intelligence**: deep Google ecosystem sync (Merchant API v1, GA4, Business Profile, Search Console), an AI Marketing Agent, AI Customer Service Agent, AI Pricing Agent, and analytics/BI with AI inventory forecasting. AICOS becomes not just *how you launch* but *how you grow*.

### Year 3 — *"Scale & Enterprise"* (Phase 5)
Automation Engine, multi-region, Kubernetes, white-label/agency licensing, and the compliance path (GDPR operationalized, SOC 2 Type II). AICOS becomes the platform agencies and resellers build *their* businesses on, and the system enterprises trust with cost governance and advanced observability/security.

### Years 4–5 — *"The Commerce Operating System for the Physical World"*
- **A marketplace flywheel:** themes/templates, add-on integrations, and done-for-you onboarding services create third-party revenue and lock-in.
- **Global SMB reach:** the true TAM is the **millions of offline SMBs** in SE Asia, MENA, and LATAM where Meilisearch's native multi-language indexing (Arabic, Thai, CJK) is a structural advantage incumbents lack.
- **A data network effect:** every verified extraction improves model accuracy and a shared product-knowledge graph (barcodes → canonical products via Open Food Facts and our own corpus), making AICOS's extraction progressively cheaper and more accurate than any newcomer can match.
- **The category default:** when an SMB owner anywhere thinks "put my store online," the expectation becomes *film it* — and AICOS is the brand that owns that verb.

---

## 6. Strategic Principles

1. **Inversion over imitation.** We extract catalogs from reality; competitors generate content from data. Never blur this — it is the whole moat.
2. **Human-in-the-loop is a feature, not a caveat.** The verification gate directly answers the AI-trust concern that slowed Shopify Magic and Wix Harmony adoption. We market it proactively.
3. **Speed of execution is the primary defense.** Shopify could add video extraction in 12–24 months. We win by shipping first and compounding an accuracy/data moat they cannot retroactively acquire.
4. **Depth beats a feature.** A third party could clone "extraction" as one app. We are a *full commerce OS*; the platform is the durable moat.
5. **Price is never the switching barrier.** Starter is at or below Shopify Basic; a meaningful free tier (1 extraction, ≤20 products) is mandatory because the non-technical persona will not pay before seeing results.
6. **AI cost is a managed COGS, not a guess.** Tiered model routing (Gemini Flash first pass, Claude fallback), barcode pre-filtering, and per-tenant credit guards keep extraction at ~$0.10–$0.15/video and gross margin ≥75%.

---

## 7. What Success Looks Like

A grocer in Bangkok, a boutique owner in Oslo, and a hardware-store family in Texas each film their shelves on a phone, review AI's work, tap Publish, and are selling online **before their coffee gets cold** — on a platform that then markets, prices, restocks, and supports their store for them. **That is the world AICOS is building.**
