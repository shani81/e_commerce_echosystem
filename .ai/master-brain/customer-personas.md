# AICOS — Customer Personas

> **Product:** AI Commerce OS (AICOS)
> **Document status:** Phase 0 (Planning)
> **Last updated:** 2026-06-03

All six personas from the project spec, with goals, pains, needs, and expectations. **The Store Owner is primary and the north star** — every product decision is weighed first against their experience.

---

## Persona 1 — Store Owner *(non-technical, PRIMARY)*

**Who:** Maria, 47, owns a 3-aisle neighborhood grocery / boutique / pharmacy. Runs the business from the shop floor on her phone. No technical skills, no time, has tried (and abandoned) Shopify or a Wix site before.

| | |
|---|---|
| **Top goal** | Get her store online and selling *today*, without learning software or hiring anyone |
| **Top pain** | Manual catalog entry — 20–200 hours of typing product names, prices, variants, and photos before any other platform's store even exists |
| **Key needs** | Film-and-publish onboarding; mobile-first capture; sensible AI defaults; clear review screen showing what AI got right/wrong; transparent, low price; "it just works" |
| **Expectations** | Live store in **< 15 minutes**; never forced to write code or descriptions; full control over what publishes; help when AI is unsure (missing prices flagged, not silently wrong) |
| **Fears / objections** | "AI will get my prices wrong" → answered by the **human verification gate** (marketed as a feature). "I don't want to film my shop / show competitors my prices" → answered by a **photo-batch fallback** and done-for-you onboarding |
| **Serves which streams** | Subscriptions, AI credits, GMV fee |
| **Success signal** | Publishes a store on day one; returns to add products by filming new shelves |

> Design rule: if a feature would confuse Maria, it is hidden behind defaults or deferred. The 15-minute launch is sacred.

---

## Persona 2 — Store Manager

**Who:** Daniel, 34, manages day-to-day operations for an owner who is often absent or runs multiple locations.

| | |
|---|---|
| **Top goal** | Keep catalog, inventory, and orders accurate and moving without firefighting |
| **Top pain** | Stockouts, mispriced items, and order/fulfillment chaos across channels |
| **Key needs** | Admin dashboard with inventory management, order management, bulk edits, low-stock alerts, role-scoped access, multi-location view |
| **Expectations** | Reliable real-time inventory; fast search (Meilisearch); AI inventory forecasting (P4); clear audit trail of who changed what |
| **Serves which streams** | Subscriptions (Growth/Pro), AI credits |
| **Success signal** | Runs the store with fewer manual touches each month; adopts AI agents (pricing/inventory) |

---

## Persona 3 — Store Staff

**Who:** Priya, 22, part-time floor/counter staff who fulfills orders and updates stock.

| | |
|---|---|
| **Top goal** | Do assigned tasks quickly on a phone, without access to things she shouldn't see |
| **Top pain** | Clunky tools, too many permissions or too few, unclear what to do next |
| **Key needs** | Narrow, task-scoped RBAC role; mobile order-fulfillment and stock-update flows; barcode scanning; simple notifications |
| **Expectations** | Only sees her tasks; cannot change pricing or see financials; fast and forgiving UI |
| **Serves which streams** | Subscriptions (seat counts on Pro/Enterprise) |
| **Success signal** | Onboards in minutes; completes fulfillment without manager intervention |

---

## Persona 4 — End Customer (Shopper)

**Who:** Alex, 29, discovers the store via Google/Maps/social and shops on a phone.

| | |
|---|---|
| **Top goal** | Find the product, trust the store, check out fast |
| **Top pain** | Slow/broken mobile storefronts, poor search, sketchy checkout, no order updates |
| **Key needs** | Fast storefront, accurate multilingual search (Meilisearch native CJK/Arabic/Thai), Stripe Checkout (SCA/3DS handled), shipping options, order tracking, customer portal |
| **Expectations** | Trustworthy checkout (SAQ A, PCI-compliant payment page), accurate prices/stock, timely notifications (email/chat), easy returns |
| **Serves which streams** | GMV fee, indirectly all (their spend funds the tenant) |
| **Success signal** | Completes purchase; returns; the store's GMV grows (lifting AICOS's GMV-fee revenue) |

> Note: the shopper is the *tenant's* customer, but their experience directly drives AICOS's GMV-based revenue and the tenant's retention — so storefront quality is a first-class concern.

---

## Persona 5 — Platform Super Admin *(internal — AICOS operator)*

**Who:** Sam, AICOS platform/ops engineer.

| | |
|---|---|
| **Top goal** | Operate a secure, observable, cost-controlled multi-tenant platform at scale |
| **Top pain** | Cross-tenant data leakage; AI cost bombs; provider outages; abuse/fraud |
| **Key needs** | Tenant isolation guarantees (PostgreSQL RLS + `tenant_id`, FORCE RLS, transaction-scoped `set_config`); AI cost telemetry (`ai.usage`) + credit guards; observability baseline; KEDA autoscaling; audit logs; provider fallback chains |
| **Expectations** | No cross-tenant incidents; AI spend tracked per tenant; queue-depth scaling keeps the 15-min SLA; secrets in Doppler; CVE-patched Postgres (16.9+) |
| **Serves which streams** | Protects all revenue (margin integrity, trust) |
| **Success signal** | Zero isolation incidents; AI gross margin held ≥75%; SLA met under load |

---

## Persona 6 — Agency / White-Label Reseller

**Who:** Lena, runs a digital agency serving local retailers; wants AICOS under her own brand.

| | |
|---|---|
| **Top goal** | Onboard many SMB clients fast, under her brand, and earn recurring margin |
| **Top pain** | Existing platforms are slow to set up per client and don't white-label cleanly; catalog entry kills her margins |
| **Key needs** | White-label/branding removal, reseller role + sub-tenant hierarchy (`iam`), bulk client onboarding, reseller billing/rev-share (`billing`), theme control (`theme-engine`) |
| **Expectations** | Her clients each launch in minutes; she manages all of them from one console; revenue-share is clean and transparent |
| **Serves which streams** | White-label/agency licensing, integrations marketplace, plus subscriptions for her clients |
| **Success signal** | Brings a portfolio of clients onto AICOS; expands seat/tenant count over time |

---

## Persona Priority & Phase Mapping

| Persona | Priority | First served in |
|---|---|---|
| Store Owner | **P0 (primary, north star)** | P1 commerce MVP, P2 magic |
| End Customer | High | P1 (storefront, checkout) |
| Store Manager | High | P1 (admin/inventory/orders) |
| Store Staff | Medium | P1 (RBAC, fulfillment) |
| Platform Super Admin | High (internal) | P0 (foundation/observability) |
| Agency / Reseller | Medium → High | P5 (white-label) |

---

## Cross-Persona Design Principles
1. **Default for the Store Owner.** When personas conflict, the non-technical owner's simplicity wins.
2. **RBAC is real, not cosmetic.** Manager/Staff/Owner see genuinely different surfaces; isolation is enforced at the DB (RLS), not just the UI.
3. **Trust is universal.** Every persona benefits from the human verification gate and hard tenant isolation — it is our most cross-cutting differentiator.
4. **Mobile-first for everyone on the shop floor** (Owner, Manager, Staff) and for the shopper.
