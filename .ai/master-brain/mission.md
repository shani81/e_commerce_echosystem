# AICOS — Mission

> **Product:** AI Commerce OS (AICOS)
> **Document status:** Phase 0 (Planning)
> **Last updated:** 2026-06-03

---

## Mission Statement

**AICOS gives any physical-store owner a complete, operational online store in minutes — by letting AI build the catalog from a video of their shelves, with a human always in control of what goes live.**

We exist to delete the single biggest barrier keeping millions of offline retailers offline: the weeks of manual catalog, design, SEO, and setup work that every other platform demands before a store can even exist.

---

## What We Promise the Customer

> **Film your shelves. Publish your store. In minutes.**

| We promise | We deliver it by |
|---|---|
| **Minutes, not weeks** | Video-to-catalog AI extraction replaces 20–200 hours of manual data entry |
| **No technical skill required** | AI-first, mobile-first, minimalist UX; zero setup; sensible defaults everywhere |
| **You stay in control** | A human verification gate — *nothing AI-generated publishes automatically* |
| **A real store, not a demo** | A full commerce OS: catalog, inventory, orders, payments, shipping, customers, search, marketing, analytics |
| **Fair, transparent pricing** | Starter at/below Shopify Basic, a meaningful free tier, and AI usage that is metered and predictable |

---

## How We Operate (Mission Principles)

1. **AI does the work; humans approve it.** Every AI output — extracted products, generated descriptions, themes, marketing copy — is reviewable and gated before it affects a live store. Trust is the product.
2. **Onboarding is sacred.** The < 15-minute first-launch experience is the heart of the company. We protect it from feature creep and complexity.
3. **General, not vertical.** AICOS serves grocery, fashion, electronics, pharmacy, beauty, furniture, and beyond. We resist over-fitting to any single vertical.
4. **Mobile-first, because the store owner is on the shop floor.** The capture and review experience is designed for a phone in hand, not a desk.
5. **Cost-disciplined AI.** We treat AI spend as a managed COGS — tiered model routing, barcode pre-filtering, batching, and per-tenant credit guards — so the magic stays profitable and abuse cannot create a cost bomb.
6. **Secure and compliant by construction.** Hard tenant isolation (PostgreSQL RLS + tenant_id), PCI scope minimization via Stripe, and a GDPR/SOC 2 path are designed in from Phase 0, not retrofitted.
7. **Ship fast, compound the moat.** Our durable advantage is execution speed plus an extraction-accuracy data network effect. We build it before incumbents copy the idea.

---

## Who We Serve

The **non-technical physical-store owner** is our primary persona and our north star — every decision is weighed first against *"does this make their launch faster and their day easier?"* We also serve the managers and staff who run the store day-to-day, the end customers who shop it, the platform admins who operate AICOS, and the agencies/resellers who build on top of us.

(Full detail in `customer-personas.md`.)

---

## How We Measure the Mission

- **North-Star Metric:** Time-to-Live-Store (TTLS) — median minutes from first video upload to a published, transactable storefront for a 100-SKU store. **Target: < 15 minutes.**
- **Trust:** ≥ 95% catalog accuracy at 7 days; 0 cross-tenant data incidents; 100% of AI output passing through the human gate.
- **Magic that pays:** ≥ 70% extraction auto-fill rate; ≥ 75% AI gross margin; ≥ 40% free-tier and ≥ 70% paid-tier onboarding completion.

---

## Anti-Goals (What We Will *Not* Do)

- We will **not** auto-publish AI output. Ever.
- We will **not** become restaurant-specific (or any single vertical). AICOS is a general e-commerce OS.
- We will **not** compete on price by racing to the bottom; we compete on **time-to-value**.
- We will **not** let onboarding accumulate steps. Every new flow must justify itself against the 15-minute north star.
- We will **not** ship AI features that "generate from data the merchant typed" as our headline — that is the commoditized direction everyone else already occupies.
