# AICOS — In Progress

> **PHASE 1 — Core Commerce MVP** (in progress). Trunk: `main`. Current work: branch `feat/m1.3-checkout`. Phase 0 complete (exit review 🟢 GO).
> Last updated: 2026-06-04.

## Phase 1 milestones

| Milestone | Status | Notes |
|-----------|--------|-------|
| **M1.1** Catalog + inventory + media (+ admin CRUD) | ✅ Done | API + admin UI; verified (smoke 17/17, build 11 routes). |
| **M1.2** Meilisearch + tenant tokens + storefront browse | ✅ Done | Meili index sync; tenant search + token; PUBLIC storefront browse/detail; web `/shop` + `/products/[slug]`. Verified live (smoke 13/13). |
| **M1.3** Stripe Checkout + Connect + tax + order-on-payment | ✅ Done | Cart → Checkout (Connect destination charge + application fee + Stripe Tax), order lifecycle via the idempotent webhook worker, Connect onboarding, admin orders + refunds, web cart/checkout. **Verified — contract smoke 19/19; live Stripe deferred (needs test keys).** |
| **M1.4** Shipping (Shippo) labels/tracking + notifications | 🟦 Planned | |
| **M1.5** Customer portal + returns scaffolding | 🟦 Planned | |
| **M1.6** GDPR DSAR + CSV/WooCommerce import | 🟦 Planned | |

## M1.3 — delivered
- **Cart (API, public)**: token-addressed anonymous cart under `/storefront/:slug/cart` — create / add / set-qty / remove with live re-pricing and a DENY-policy stock guard.
- **Checkout (API, public)**: `POST /storefront/:slug/checkout` converts the cart to a DRAFT order + opens a Stripe **Checkout Session**. Uses a **Connect destination charge** + `application_fee_amount` (PLATFORM_FEE_BPS) when the tenant is onboarded, else a direct charge (dev); **Stripe Tax** via `automatic_tax` when enabled. Order rolled back if the session fails. Graceful **503** when Stripe is unconfigured.
- **Order lifecycle (worker)**: extended `BillingProcessor` — `checkout.session.completed` → order PAID + Payment + inventory decrement (SALE ledger) + cart converted; `payment_intent.payment_failed`; `charge.refunded`; `account.updated` (Connect sync). Idempotent (Redis processed-marker **+** upserts keyed on Stripe ids).
- **Connect onboarding (API, admin)**: create Express account, hosted AccountLink, capability status sync (`/connect/*`).
- **Orders (API, admin)**: list + detail; refund with `reverse_transfer` for destination charges.
- **RBAC + config**: `order:* / payment:* / customer:*` permissions; commerce config (fee bps, tax toggle, checkout + Connect URLs); `.env.example` documented.
- **Web**: add-to-cart on the product page, `/cart` (qty edit, email, Stripe redirect), `/checkout/success` + `/checkout/cancel`. **Admin**: Orders page (list + detail + refund) and Payments/Connect settings page.

## Next
1. **M1.4** — Shipping (Shippo) labels/tracking + transactional notifications on order paid/shipped.
2. Carry-forward: **live Stripe smoke** (test keys + `stripe listen`); move search-sync onto the BullMQ outbox; domain-based storefront tenant resolution; promo/discount + tax-line surfacing in the cart UI.
