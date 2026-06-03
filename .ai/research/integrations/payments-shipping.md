# AICOS — Payments & Shipping Integration Research

**Area:** payments-shipping
**Date:** 2026-06-03
**Author:** Senior Research Agent (Claude Sonnet 4.6)
**Scope:** Stripe for multi-tenant SaaS marketplace + shipping carrier/aggregator strategy

---

## Executive Summary

AICOS is a multi-tenant SaaS platform where each tenant is an independent physical store transacting with their own end customers. The payments stack must serve two distinct money flows simultaneously: (1) **SaaS subscription billing** — AICOS collecting recurring fees from store owners for platform access, and (2) **commerce payments** — buyers paying stores, with AICOS optionally collecting a transaction fee margin. Stripe is the correct and only serious option for both flows. For shipping, an aggregator (EasyPost or Shippo) rather than direct carrier integrations is the correct default for Phase 1; direct PostNord/Bring direct APIs should be layered on only if Nordic tenant concentration demands it.

---

## 1. Stripe Architecture for AICOS

### 1.1 Two Money Flows — One Stripe Account

AICOS needs Stripe to handle two different payment contexts from one platform Stripe account:

| Flow | Payer | Payee | Stripe Product |
|------|-------|-------|---------------|
| SaaS subscriptions | Store owner (tenant) | AICOS platform | Stripe Billing |
| Store commerce | End customer (shopper) | Tenant store | Stripe Connect + Checkout/Payment Intents |

These are architecturally separate. The SaaS billing flow uses Stripe Customers + Subscriptions keyed to the tenant's owner email. The commerce flow uses Stripe Connect to route buyer funds to each tenant's connected account. Both flows share the AICOS platform Stripe account as the root entity.

---

## 2. Stripe Checkout vs. Payment Intents

### 2.1 The APIs Explained

**Stripe Checkout (Checkout Sessions API)**
- Stripe-hosted prebuilt payment page (redirect or embedded iframe)
- Internally creates a PaymentIntent under the hood
- Supports 40+ payment methods, Apple Pay, Google Pay, address collection, line items, tax calculation, coupon/promo codes, upsells
- PCI DSS scope is minimal — the card form is entirely on Stripe's domain
- Enables `automatic_tax: {enabled: true}` for Stripe Tax with one parameter

**Payment Intents API (+ Payment Element)**
- Lower-level API — you build your own UI, pass the PaymentIntent's `client_secret` to Stripe.js
- Full control over checkout flow, styling, multi-step flows
- Required for complex flows: split payments across multiple sessions, deferred capture workflows, in-page embedded experience matching custom brand
- More ongoing maintenance (handle SCA/3DS yourself, monitor authentication failures)

### 2.2 Recommendation for AICOS

**Use Stripe Checkout (Checkout Sessions) for Phase 1 commerce payments.**

Rationale:
- Non-technical store owners do not want to maintain a custom payment form
- The embedded mode (`ui_mode: embedded`) renders inside AICOS's storefront iframe while keeping PCI scope off AICOS's servers
- Built-in support for `automatic_tax`, `shipping_address_collection`, line items, discounts, and promotion codes eliminates custom code for common needs
- Stripe handles SCA/3DS, currency detection, and payment method localisation automatically
- Connect destination charges integrate cleanly: pass `payment_intent_data.transfer_data.destination = connected_account_id` to the Checkout Session

**Upgrade path to Payment Intents when:**
- A tenant requires deeply custom branded checkout (enterprise tier)
- Multi-party split orders (one basket, multiple sellers) require separate charges and transfers pattern
- One-click/stored-card re-orders need a faster flow (Setup Intent + off-session PaymentIntent)

Sources: [Compare Checkout Sessions and Payment Intents](https://docs.stripe.com/payments/checkout-sessions-and-payment-intents-comparison) | [Build a payments page](https://docs.stripe.com/payments/checkout)

---

## 3. Stripe Connect — Tenant Payment Routing

### 3.1 Why Stripe Connect is Required

Every tenant store is an independent seller. When a buyer pays €50 for a product, AICOS collects the €50 from the buyer, deducts its platform fee (e.g., 1–2%), and routes the remainder to the specific tenant. Without Connect, AICOS would receive all funds and be legally the merchant of record for every store — an unsustainable compliance and money-transmission burden.

Stripe Connect makes each tenant a **connected account**: they collect funds, Stripe runs KYC/AML on them, and AICOS earns an application fee per transaction.

### 3.2 Accounts v2 API — Use This for New Integrations

As of December 2025, Stripe launched the **Accounts v2 API** (`/v2/core/accounts`). The legacy Standard/Express/Custom distinction is deprecated for new platforms. Stripe now recommends v2 for all new Connect integrations.

The v2 model uses **configurations** assigned to a single Account object:

| Configuration | Purpose |
|--------------|---------|
| `merchant` | Accept payments (includes `card_payments`, `stripe_balance.payouts`) |
| `customer` | Charge the account as a customer; replaces Customer objects for SaaS billing on connected accounts |
| `recipient` | Receive transfers for indirect charges |

For AICOS tenants: assign both `merchant` (to accept buyer payments) and `recipient` (to receive platform transfers).

```typescript
// Create a new tenant connected account (v2 API)
const account = await stripe.v2.core.accounts.create({
  contact_email: 'owner@mystore.com',
  display_name: 'My Store Name',
  identity: {
    country: 'us',
    entity_type: 'individual',
    business_details: { registered_name: 'My Store LLC' },
  },
  configuration: {
    merchant: {
      capabilities: { card_payments: { requested: true } },
    },
    recipient: {
      capabilities: { stripe_balance: { stripe_transfers: { requested: true } } },
    },
  },
});
```

For platforms using OAuth (e.g., letting an existing Stripe user link their account), continue to use v1 APIs with Standard account type.

Sources: [Connect and the Accounts v2 API](https://docs.stripe.com/connect/accounts-v2) | [Accounts v2 launch (Dec 2025)](https://docs.stripe.com/changelog/clover/2025-12-15/accounts-v2)

### 3.3 Onboarding Tenants

Stripe Connect Onboarding handles KYC/AML identity verification. AICOS should use **Stripe-hosted onboarding** via `AccountLink` objects — this reduces compliance burden and auto-updates when regulatory requirements change (which they do frequently, especially in EU).

```typescript
const accountLink = await stripe.accountLinks.create({
  account: connectedAccountId,
  refresh_url: 'https://platform.aicos.io/onboarding/refresh',
  return_url: 'https://platform.aicos.io/onboarding/complete',
  type: 'account_onboarding',
});
// Redirect tenant to accountLink.url
```

Do **not** build a custom onboarding form. The maintenance cost of tracking changing verification requirements across 30+ countries outweighs any branding benefit. Use Stripe's hosted flow for Phase 1 and 2.

### 3.4 Charge Type Selection

**Recommendation: Destination Charges**

For a single-seller-per-order marketplace (the typical case in AICOS Phase 1), destination charges are the correct pattern:

```typescript
// In a Checkout Session
const session = await stripe.checkout.sessions.create({
  mode: 'payment',
  line_items: [...],
  payment_intent_data: {
    application_fee_amount: platformFeeInCents, // e.g., 1.5% of order total
    transfer_data: {
      destination: tenantStripeAccountId,
    },
    on_behalf_of: tenantStripeAccountId, // settle in tenant's country
  },
  automatic_tax: { enabled: true },
  // ...
});
```

The `on_behalf_of` parameter is critical for cross-region tenants (e.g., a Swedish tenant on a US platform). It makes the tenant the settlement merchant, uses their country's fee structure, and minimises currency conversion.

**Use Separate Charges + Transfers only when:** a single order contains products from multiple tenants (multi-seller cart). Implement this in Phase 2+. The flow:
1. Create a charge on the platform account for the full order amount
2. After payment success, loop over each seller's sub-total and create a separate Transfer to each tenant's connected account

Source: [Understand how charges work in Connect](https://docs.stripe.com/connect/charges) | [Create destination charges](https://docs.stripe.com/connect/destination-charges)

### 3.5 Connect Pricing

Stripe Connect pricing (as of June 2026, SE pricing page as proxy for European operations):

| Fee Type | Cost | Notes |
|----------|------|-------|
| Standard payments (EU EES cards) | 1.5% + 1.80 kr | Per transaction |
| Standard payments (UK cards) | 2.5% + 1.80 kr | Per transaction |
| Standard payments (International) | 3.25% + 1.80 kr | Per transaction |
| Per-payout fee (platform-managed) | 0.25% + 5 SEK per payout | Charged monthly |
| Per active connected account (platform-managed) | 15 SEK/month | Only accounts with payouts |
| Instant payouts | 1% of payout volume | Optional; min 5 kr |
| Cross-border payouts | From 0.25% | Per payout |
| Stripe-managed pricing | No platform fee | Stripe bills connected account directly |

**Strategy for AICOS:** Default to **Stripe-managed pricing** for Phase 1 — Stripe bills each connected account directly for their processing fees, meaning AICOS pays no per-account or per-payout platform fees. AICOS earns via the `application_fee_amount` (platform transaction cut). Switch to platform-managed pricing only when AICOS negotiates custom volume rates with Stripe.

Source: [Stripe Connect Pricing](https://stripe.com/connect/pricing) | [Stripe Connect Marketplace Guide 2026](https://greenmoov.app/articles/en/stripe-connect-for-marketplace-payments-explained-account-types-onboarding-and-pricing-2026-guide)

---

## 4. Stripe Billing — SaaS Subscription Plans

### 4.1 Overview

Stripe Billing manages AICOS's own SaaS subscription tiers (Starter / Growth / Pro / Enterprise). Each store owner is a Stripe **Customer** object linked to a **Subscription** with a recurring **Price**.

### 4.2 Pricing Model for AICOS SaaS Plans

Use **tiered flat-rate + metered add-ons** pricing:

```
Starter    → $29/mo flat (base features, 1 store, limited AI credits)
Growth     → $79/mo flat (advanced features, higher limits)
Pro        → $199/mo flat (unlimited features, priority support)
Enterprise → Custom (negotiated, includes white-label)
```

Plus metered add-ons billed via **usage meters**:
- AI extraction minutes (video processing)
- AI generation credits (content/SEO generation)
- Overage on product catalog size

The Billing API supports all of these natively via `recurring.usage_type: metered` and Stripe Meters (2025 advanced usage-based billing). Send meter events via:

```typescript
await stripe.billing.meterEvents.create({
  event_name: 'ai_extraction_minutes',
  payload: {
    value: '5',
    stripe_customer_id: customerId,
  },
  timestamp: Math.floor(Date.now() / 1000),
});
```

Stripe aggregates events and includes usage charges in the next invoice automatically.

### 4.3 Billing Fee Structure

| Model | Cost | Best For |
|-------|------|---------|
| Pay-as-you-go | 0.7% of billing volume | Early stage, unpredictable volume |
| Monthly plan Tier 1 | ~$625/mo (1M kr volume cap) | Growing platforms |
| Monthly plan Tier 2 | ~$1,500/mo (2.5M kr volume cap) | Mid-scale |
| Enterprise | Custom | High volume (custom rate) |

Note: Stripe raised the standard Billing fee from 0.5% to **0.7%** effective June 30, 2025. Plan for this in unit economics.

Sources: [Stripe Billing Pricing](https://stripe.com/billing/pricing) | [Stripe Billing fee increase](https://www.wingback.com/blog/stripe-billing-price-increase)

### 4.4 Customer Portal

Enable Stripe's hosted **Customer Portal** for self-service plan management (upgrade, downgrade, cancel, view invoices, update payment method). One configuration object, zero custom code:

```typescript
const portalConfig = await stripe.billingPortal.configurations.create({
  business_profile: { headline: 'AICOS Subscription Management' },
  features: {
    subscription_update: { enabled: true, proration_behavior: 'create_prorations' },
    subscription_cancel: { enabled: true, mode: 'at_period_end' },
    invoice_history: { enabled: true },
    payment_method_update: { enabled: true },
  },
});
```

### 4.5 Dunning and Retry Logic

Configure `collection_method: charge_automatically` on all subscriptions. Stripe's Smart Retries (ML-powered) automatically retries failed payments at optimal times. Configure in Dashboard:
- First retry: 3 days after failure
- Second retry: 5 days after first retry
- Third retry: 7 days after second retry
- Cancel subscription after: 21 days total (tune per tier)

Send webhook-triggered emails at `invoice.payment_failed` and `customer.subscription.deleted`.

### 4.6 SaaS Billing + Connect Integration

For tenants on paid plans, AICOS can use `charge_automatically` against the tenant's own Stripe Customer object. Using the Accounts v2 `customer` configuration, the tenant's connected account can be charged as a customer:

```typescript
// Charge SaaS subscription fee directly to connected account
const subscription = await stripe.subscriptions.create({
  customer: tenantCustomerId, // Customer on the AICOS platform account
  items: [{ price: 'price_aicos_growth_monthly' }],
});
```

Source: [Charge SaaS fees to connected accounts](https://docs.stripe.com/connect/integrate-billing-connect) | [Recurring pricing models](https://docs.stripe.com/products-prices/pricing-models)

---

## 5. Stripe Tax

### 5.1 Scope

Stripe Tax automatically calculates and collects **sales tax** (US), **VAT** (EU, UK), and **GST** (AU, NZ, CA, etc.) on all transactions — both SaaS subscription invoices and store commerce payments.

Coverage: 100+ countries, 600+ product categories. Stripe can also **file returns automatically** in 90+ countries and all US states (Tax Filing product, additional cost).

### 5.2 Enabling Stripe Tax

The integration is a single parameter on Checkout Sessions and Invoices:

```typescript
// Checkout Session (buyer commerce)
const session = await stripe.checkout.sessions.create({
  automatic_tax: { enabled: true },
  customer_details: { address: { country: 'SE' } }, // from shipping address
  // ...
});

// Subscription Invoice (SaaS billing)
await stripe.subscriptions.create({
  automatic_tax: { enabled: true },
  // ...
});
```

Tax is only calculated in jurisdictions where AICOS (or the tenant, for commerce) has an active tax registration. AICOS must register in each jurisdiction via the Stripe Dashboard or the Tax Registration API.

### 5.3 Tax for Connect Platforms

For commerce payments, tax is calculated from the perspective of the `on_behalf_of` connected account (the tenant). This means the tenant's nexus/registrations determine tax applicability — important for multi-country tenants.

For SaaS subscription billing, AICOS is the seller; AICOS's own tax registrations apply.

Source: [Tax for software platforms](https://docs.stripe.com/tax/tax-for-platforms) | [Countries supported by Stripe Tax](https://docs.stripe.com/tax/supported-countries) | [New country registrations (Apr 2025)](https://docs.stripe.com/changelog/basil/2025-04-30/additional-tax-registration-countries)

### 5.4 Pricing

| Integration | Cost |
|-------------|------|
| No-code (Dashboard only) | 0.5% of taxable transaction volume |
| API integration | $0.05 per Calculation API call beyond 10 free per Transaction |
| Tax Complete (filing included) | From ~$960/month (annual contract, regional pricing varies) |

Recommendation: Start with API integration at $0.05/Calculation. Switch to a flat monthly plan when taxable volume exceeds ~$10,000/month (break-even with 0.5% no-code pricing).

---

## 6. Coupons, Promotion Codes, and Gift Cards

### 6.1 Coupons and Promotion Codes

Stripe's Coupon + Promotion Code system works natively with both Checkout and Billing subscriptions.

**Coupon** — the underlying discount rule:
- `percent_off: 20` (20% discount) or `amount_off: 500` (€5 off, in cents)
- `duration: once | repeating | forever` (for subscription coupons)
- `max_redemptions`, `redeem_by` (expiry timestamp)

**Promotion Code** — the human-readable code (`SUMMER25`) that points to a Coupon:
- Can be customer-restricted (`applies_to.customer_ids`)
- Can have `restrictions.minimum_amount` (minimum cart value)
- Can be `first_time_transaction` restricted (new customers only)

Enable in Checkout:
```typescript
const session = await stripe.checkout.sessions.create({
  allow_promotion_codes: true, // shows promo code input box
  discounts: [{ coupon: 'FIXED_COUPON_ID' }], // OR pre-apply a coupon
  // ...
});
```

**Important 2025 API change:** Stripe's September 2025 API version (`clover`) changed the `PromotionCode.coupon` field to a polymorphic object with `type: 'coupon'`. Pin the API version in your Stripe SDK configuration to avoid unexpected behaviour.

Source: [Coupons and promotion codes](https://docs.stripe.com/billing/subscriptions/coupons) | [Polymorphic coupon field (Sep 2025)](https://docs.stripe.com/changelog/clover/2025-09-30/polymorphic-coupon) | [Promotion Code API](https://docs.stripe.com/api/promotion_codes)

### 6.2 Gift Cards

Stripe does not have a native gift card product (as of June 2026). The standard implementation pattern:

1. Sell a gift card → create a Stripe Coupon with `amount_off` equal to the gift card value, restricted to `max_redemptions: 1` and `redeem_by` (expiry). Store the coupon ID against the gift card record in the AICOS database.
2. Create a Promotion Code on that Coupon with a unique alphanumeric code matching the physical/digital gift card.
3. At redemption, the buyer enters the code at checkout; Stripe applies the coupon.
4. Track remaining balance in AICOS (if partial redemption is needed, split into multiple coupons or use a custom gift card balance table).

For full-featured gift card management (balance tracking, physical card issuance, partial redemptions), consider a dedicated gift card provider (e.g., GiftUp, which has a Stripe integration) or build a custom balance ledger in PostgreSQL.

### 6.3 Multi-Tenant Coupon Scoping

Each tenant should create coupons in their own Stripe connected account scope (direct charge model) OR AICOS creates coupons on the platform account and restricts them to specific `metadata.tenant_id` values (destination charges model). The latter is simpler to manage centrally. Implement a `tenant_id` metadata field on every Coupon and Promotion Code object.

---

## 7. Refunds

### 7.1 Refund Mechanics with Connect

How refunds work depends on the charge type used:

**Destination Charges (recommended for AICOS):**
- `POST /v1/refunds` on the PaymentIntent (or Charge) — refund comes from the **platform account** balance by default
- To claw back funds from the connected account: set `reverse_transfer: true`
- To return the application fee (platform margin): set `refund_application_fee: true`
- Partial refunds: supported; call the API with `amount` less than full charge

```typescript
const refund = await stripe.refunds.create({
  payment_intent: paymentIntentId,
  amount: partialAmountInCents, // omit for full refund
  reverse_transfer: true,       // pull funds back from tenant account
  refund_application_fee: true, // return AICOS's fee too
  reason: 'customer_request',  // one of: duplicate, fraudulent, customer_request
});
```

**Policy recommendations:**
- **Full refund:** reverse_transfer=true, refund_application_fee=true (AICOS absorbs the Stripe processing fee, which is not refunded by Stripe)
- **Partial refund initiated by tenant:** reverse_transfer=true, refund_application_fee=false (AICOS keeps its margin, tenant absorbs the shortfall)
- **Fraud refund:** always reverse_transfer=true; report to Stripe fraud team

### 7.2 Dispute Handling

With destination charges, the **platform bears dispute liability**. AICOS must:
1. Subscribe to `charge.dispute.created` webhooks
2. Auto-notify the tenant within 24 hours
3. Collect evidence from the tenant (delivery proof, correspondence) via a dashboard workflow
4. Submit evidence via Stripe API within the dispute window (typically 7–21 days depending on card network)
5. Hold funds reserves per-tenant for high-dispute-rate tenants (flag when dispute rate > 0.5%)

Source: [Handle refunds and disputes (Connect)](https://docs.stripe.com/connect/marketplace/tasks/refunds-disputes) | [Refund and cancel payments](https://docs.stripe.com/refunds)

---

## 8. Shipping Strategy

### 8.1 Direct Carrier APIs vs. Aggregators

| Factor | Direct Carrier APIs | Aggregator (EasyPost/Shippo) |
|--------|--------------------|-----------------------------|
| Integration effort | High — one integration per carrier (6+ carriers = 6 different APIs, auth flows, label formats) | Low — single REST API for all carriers |
| Carrier coverage | Only contracted carriers | 40–100+ carriers via one API |
| Rate shopping | Manual, separate calls per carrier | Built-in: one call returns all rates |
| Label generation | Different per carrier | Unified label object and PDF |
| Tracking | Different webhooks per carrier | Unified tracking events webhook |
| Nordic carriers (PostNord/Bring) | Native support | Partial (Shippo has Bring; EasyPost does not natively list PostNord/Bring in wallet) |
| Negotiated carrier rates | Full control | BYOCA (Bring Your Own Carrier Account) plan available |
| Pricing | Carrier rate only | Carrier rate + aggregator fee per label |
| Contract requirement | Yes, per carrier | No (aggregator pre-negotiates rates) |

**Verdict: Use an aggregator for Phase 1. Add direct PostNord/Bring integration for Nordic market tenants if needed.**

### 8.2 EasyPost — Detailed Assessment

**Strengths:**
- API-first, developer-friendly — clean REST API with TypeScript SDK
- 100+ carriers via Wallet plan (pre-enabled, no carrier contracts required)
- Up to 3,000 free labels on the free tier, then $0.03–$0.05/label
- BYOCA plan ($20/month) for tenants with existing carrier contracts and negotiated rates
- Luma AI integration for smart carrier selection
- Address verification: $0.02–$0.06 per request
- Tracking: $0.01–$0.03 per shipment

**Weaknesses:**
- PostNord and Bring are **not** listed in EasyPost's Wallet carrier catalog (as of June 2026)
- No built-in operational dashboard for tenant-level reporting
- Nordic coverage requires BYOCA or a separate PostNord/Bring integration

**Pricing:**

| Plan | Base | Per Label | Notes |
|------|------|-----------|-------|
| Free | $0 | $0.03–$0.05 | Up to 3,000 labels free |
| BYOCA | $20/month | $0.03–$0.05 + carrier rate | For own carrier accounts |
| Enterprise | Custom | Negotiated | High volume |

Source: [EasyPost Pricing](https://www.easypost.com/pricing/) | [EasyPost Carriers](https://www.easypost.com/carriers/)

### 8.3 Shippo — Detailed Assessment

**Strengths:**
- **Bring carrier is natively supported** (goshippo.com/carriers/bring) — critical for Nordic tenants
- 40+ carriers via API
- Starter plan: first 30 labels/month free, then $0.07/label (no monthly fee)
- Address validation: $0.02/validation (US), $0.08 (international)
- Tracking: $0.02/unique tracking number
- Insurance: 1.25% domestic / 1.5% international
- Rate generation: $0.01/call
- Webhook-based tracking events

**Weaknesses:**
- More expensive per-label than EasyPost for high-volume ($0.07 vs $0.03–$0.05)
- PostNord appears supported via BYOCA but not confirmed as a first-class Wallet carrier
- Less API flexibility than EasyPost for complex custom workflows

**Pricing:**

| Plan | Monthly | Labels Included | Additional Labels | Notes |
|------|---------|----------------|-------------------|-------|
| API Starter | $0 | 30/month free | $0.07/label | Pay-as-you-go |
| API Premier | Custom | Unlimited | Volume discounts | Dedicated account manager |

Source: [Shippo API Pricing](https://goshippo.com/pricing/api) | [Shippo Bring carrier page](https://goshippo.com/carriers/bring)

### 8.4 Nordic Carriers: PostNord and Bring Direct APIs

AICOS targets markets including Norway and Sweden (PostNord, Bring). Neither EasyPost nor Shippo fully cover these in their Wallet (pre-negotiated) plans.

**PostNord Direct API:**
- Developer portal: [developer.postnord.com](https://developer.postnord.com/apis/details?systemName=shipment-v3-booking-sao)
- Covers Denmark, Sweden, Norway, Finland
- Shipment v3 Booking API: generates labels, handles customs, returns tracking numbers
- Per-country API contacts: DK (kundeintegration@postnord.com), SE (kundintegration.se@postnord.com), NO (edi.no@postnord.com), FI (it.fi@postnord.com)
- **Migration deadline critical:** PostNord deprecated legacy EDI solutions in 2025–2026; all integrations must use the new REST API. DK deadline was Feb 2026; SE requires migration or faces per-shipment surcharges from March 2026.

**Bring Direct API:**
- Bring (Posten Norge) has a REST API at [developer.bring.com](https://developer.bring.com)
- Services: Mailbox parcel, Business parcel, express, returns
- Shippo natively supports Bring — verify via Shippo's BYOCA for cost optimization

### 8.5 Recommended Approach for AICOS

**Phase 1 (Core Commerce MVP):** Integrate **Shippo** as the primary shipping aggregator.

Rationale:
- Shippo supports Bring natively (critical for Norway/Sweden tenants)
- $0 monthly fee for low-volume starts — fits per-tenant SaaS model
- Single API covers USPS, FedEx, UPS, DHL, Bring, and 35+ more from day one
- Rate-shopping built in: one API call returns all rates for comparison
- Unified tracking webhooks simplify AICOS's notification system
- $0.07/label is acceptable at Phase 1 volumes; switch to EasyPost at high volume

**Phase 2 (Nordic expansion):** Add **PostNord direct API** integration for Swedish and Danish tenants who require PostNord-specific services (same-day, pickup points, parcel lockers). Route PostNord shipments through the direct API, all other carriers through Shippo.

**Architecture:**

```
AICOS Shipping Service (NestJS)
  ├── ShippingProvider interface
  │   ├── ShippoProvider (default for all carriers)
  │   │   ├── USPS, FedEx, UPS, DHL, Bring, 35+ others
  │   └── PostNordProvider (Nordic tenants only, Phase 2)
  │       ├── PostNord DK, SE, NO, FI
  └── CarrierRouter
      → selects provider based on tenant country + carrier preference
```

This abstraction layer (behind an interface) means swapping or adding carriers never changes the order/fulfillment modules.

### 8.6 Shipping API Data Model

Key objects that AICOS must store per shipment:

```typescript
interface ShipmentRecord {
  id: string;
  orderId: string;
  tenantId: string;
  carrier: string;              // 'ups', 'fedex', 'bring', 'postnord_se'
  serviceLevel: string;         // 'ups_ground', 'bring_servicepakke'
  trackingNumber: string;
  labelUrl: string;             // PDF label URL (S3/R2 cached copy)
  labelFormat: 'PDF' | 'ZPL';
  rateId: string;               // aggregator rate ID for audit
  rateAmountCents: number;      // actual label cost
  currency: string;
  status: ShipmentStatus;       // created | in_transit | out_for_delivery | delivered | exception
  estimatedDelivery: Date;
  events: TrackingEvent[];
  createdAt: Date;
  updatedAt: Date;
}
```

### 8.7 Rate Shopping Flow

```
1. POST /shipping/rates
   → input: from_address, to_address, parcel dimensions/weight, tenant_id
   → ShippoProvider.getRates() returns [{carrier, service, price, days, rateId}]
   → filter by tenant's preferred carriers (stored in tenant settings)
   → return sorted by price or speed per buyer preference

2. POST /shipping/purchase
   → input: rateId, orderId
   → ShippoProvider.purchaseLabel(rateId)
   → store ShipmentRecord in PostgreSQL
   → upload label PDF to S3/R2 (label URLs expire, so cache a copy)
   → emit OrderShipped event to BullMQ → triggers notification worker

3. Tracking webhooks (POST /shipping/webhooks/shippo)
   → verify Shippo webhook signature
   → update ShipmentRecord.status + ShipmentRecord.events
   → emit TrackingUpdated event → notification worker sends customer email/SMS
```

---

## 9. Webhook Strategy

All Stripe and shipping webhooks must be handled reliably. Use BullMQ for at-least-once processing:

```
Stripe → POST /webhooks/stripe
  → verify stripe-signature header (stripe.webhooks.constructEvent)
  → enqueue to BullMQ 'stripe-events' queue
  → return 200 immediately
  → worker processes: payment_intent.succeeded, checkout.session.completed,
    invoice.payment_failed, account.updated, transfer.created, etc.

Shippo → POST /webhooks/shippo
  → verify Shippo HMAC signature
  → enqueue to BullMQ 'shippo-events' queue
  → worker processes: track.updated events → update shipment status
```

Always return HTTP 200 within 5 seconds of receiving a webhook. Stripe will retry for 72 hours on non-200 responses. Implement idempotency keys on all critical mutations.

---

## 10. Stripe Webhook Events to Handle (Priority)

| Event | Action |
|-------|--------|
| `checkout.session.completed` | Create Order, mark payment captured, trigger fulfillment |
| `payment_intent.payment_failed` | Notify buyer, release held inventory |
| `invoice.paid` | Mark SaaS subscription active; unlock plan features |
| `invoice.payment_failed` | Dunning flow; send retry email |
| `customer.subscription.updated` | Update tenant plan tier in AICOS DB |
| `customer.subscription.deleted` | Downgrade tenant to free; restrict features |
| `account.updated` | Update tenant KYC status; unlock payout when `payouts_enabled: true` |
| `transfer.created` | Record revenue share in platform ledger |
| `charge.dispute.created` | Alert tenant; start evidence collection workflow |
| `charge.refunded` | Update Order status; notify tenant |

---

## 11. Security and Compliance

### PCI DSS
- Stripe Checkout (hosted/embedded): SAQ A — minimal scope, Stripe handles all card data
- Payment Element: SAQ A-EP — card data flows through Stripe.js but the field is on your domain
- Never log or store raw card numbers anywhere

### Stripe Connect KYC/AML
- Stripe performs KYC on all connected accounts during onboarding
- AICOS must display `requirements.currently_due` to tenants and block payouts until complete
- Subscribe to `account.updated` webhook to detect when `requirements.disabled_reason` is set

### API Key Management
- Platform secret key: stored in environment variable, never in code
- Restricted keys per service: shipping service only needs read access to customers; billing service needs full Billing scope
- Use Stripe's Restricted Key configuration to limit key scope per microservice

### GDPR (EU tenants)
- Stripe is GDPR-compliant and acts as a data processor
- Personal data (names, addresses) in Order records must comply with AICOS's own GDPR policies
- Implement right-to-erasure: when a customer requests deletion, anonymize order records but retain financial records (7-year minimum for accounting in most EU jurisdictions — use a `retained_for_accounting` flag)

---

## 12. Cost Model Summary

### Per Commerce Transaction (Example: €100 order, EU buyer, EU tenant)

| Fee | Rate | Amount |
|-----|------|--------|
| Stripe payment processing (EU card) | 1.5% + €0.18 | €1.68 |
| Stripe Tax (if enabled) | 0.5% of taxable volume | €0.50 |
| AICOS platform fee (1.5%) | 1.5% | €1.50 |
| Shippo label | $0.07 flat | ~€0.06 |
| **Total cost** | | **~€3.74** |
| **Tenant receives** | | **~€96.26** |

### Per Tenant per Month (Growth plan, $79/mo, ~€1,000 GMV)

| Fee | Cost |
|-----|------|
| AICOS SaaS subscription | $79 |
| Stripe Billing fee (0.7%) | $0.55 |
| Stripe Tax (0.5% of $79) | $0.40 |
| **Total platform cost** | **~$79.95** |

---

## 13. Decisions and Recommendations Summary

| Decision | Recommendation | Rationale |
|----------|---------------|-----------|
| Checkout vs Payment Intents | Stripe Checkout (embedded mode) for Phase 1 | Low code, PCI-safe, built-in tax/promos; upgrade to Payment Intents for custom flows |
| Connect account type | Accounts v2 API with `merchant` + `recipient` configs | Latest Stripe recommendation; unified API surface; replaces deprecated Standard/Express/Custom |
| Charge type | Destination charges with `on_behalf_of` | Single-seller-per-order; handles cross-region settlement correctly |
| Connect pricing | Stripe-managed (no platform fees) initially | Avoids per-account/per-payout fees until AICOS negotiates volume rates |
| SaaS billing | Stripe Billing, 0.7% PAYG | No code for recurring billing, dunning, portal; metered add-ons for AI credits |
| Tax | Stripe Tax, API integration mode | One parameter; covers 100+ countries; file automatically at scale |
| Coupons/promos | Stripe Coupons + Promotion Codes | Native in Checkout; supports tenant-scoped promos via metadata |
| Gift cards | Custom AICOS ledger + Stripe Coupon per card | No native Stripe gift card; simple pattern covers Phase 1 |
| Refunds | Programmatic via Stripe API, reverse_transfer=true | Automate full refunds; configurable partial refund policy |
| Shipping aggregator | **Shippo** | Bring carrier support for Nordic markets; $0 monthly base; 40+ carriers |
| Nordic shipping | Shippo (Bring) + PostNord direct API (Phase 2) | Shippo covers Bring; PostNord needs direct integration for full Nordic coverage |
| Carrier abstraction | ShippingProvider interface in NestJS | Swap/add carriers without changing order/fulfillment modules |

---

## 14. Implementation Sequence

### Phase 1 (Core Commerce MVP)
1. Create Stripe platform account; configure branding
2. Implement Accounts v2 API: create connected accounts on tenant signup
3. Build tenant onboarding flow using AccountLink (Stripe-hosted)
4. Implement Checkout Session creation with destination charges + `on_behalf_of`
5. Enable Stripe Tax (`automatic_tax: {enabled: true}`) on all Checkout Sessions
6. Configure Stripe Billing for SaaS subscription plans (4 tiers + metered AI credits)
7. Enable Customer Portal for self-service plan management
8. Integrate Shippo API: rate fetching, label purchase, tracking webhooks
9. Set up BullMQ webhook processing for Stripe + Shippo events
10. Implement refund API endpoint with configurable reverse_transfer policy

### Phase 2 (Nordic + Advanced)
11. Add PostNord direct API integration (DK, SE, NO) via ShippingProvider interface
12. Implement multi-seller cart → Separate Charges + Transfers pattern
13. Add gift card support: custom ledger + Stripe Coupon per card
14. Add Stripe Tax filing automation (Tax Complete plan)
15. Implement dispute evidence collection dashboard for tenants

---

## Sources

- [Stripe Connect Overview](https://stripe.com/connect)
- [Connect and the Accounts v2 API](https://docs.stripe.com/connect/accounts-v2)
- [Accounts v2 launch (Dec 2025)](https://docs.stripe.com/changelog/clover/2025-12-15/accounts-v2)
- [Connected Account Types (legacy)](https://docs.stripe.com/connect/accounts)
- [Stripe Connect Pricing](https://stripe.com/connect/pricing)
- [Stripe Connect Marketplace Guide 2026 — Greenmoov](https://greenmoov.app/articles/en/stripe-connect-for-marketplace-payments-explained-account-types-onboarding-and-pricing-2026-guide)
- [Compare Checkout Sessions and Payment Intents](https://docs.stripe.com/payments/checkout-sessions-and-payment-intents-comparison)
- [Understand how charges work in Connect](https://docs.stripe.com/connect/charges)
- [Create destination charges](https://docs.stripe.com/connect/destination-charges)
- [Create separate charges and transfers](https://docs.stripe.com/connect/separate-charges-and-transfers)
- [Stripe Billing Pricing](https://stripe.com/billing/pricing)
- [Recurring pricing models](https://docs.stripe.com/products-prices/pricing-models)
- [Stripe Billing — usage-based billing](https://stripe.com/billing/usage-based-billing)
- [Stripe Tax](https://stripe.com/tax)
- [Tax for software platforms](https://docs.stripe.com/tax/tax-for-platforms)
- [New tax country registrations (Apr 2025)](https://docs.stripe.com/changelog/basil/2025-04-30/additional-tax-registration-countries)
- [Coupons and promotion codes](https://docs.stripe.com/billing/subscriptions/coupons)
- [Polymorphic coupon field change (Sep 2025)](https://docs.stripe.com/changelog/clover/2025-09-30/polymorphic-coupon)
- [Handle refunds and disputes in Connect](https://docs.stripe.com/connect/marketplace/tasks/refunds-disputes)
- [Stripe Billing price increase — Wingback](https://www.wingback.com/blog/stripe-billing-price-increase)
- [EasyPost Pricing](https://www.easypost.com/pricing/)
- [EasyPost Carriers](https://www.easypost.com/carriers/)
- [Shippo API Pricing](https://goshippo.com/pricing/api)
- [Shippo Bring Carrier Page](https://goshippo.com/carriers/bring)
- [EasyPost vs Shippo 2026 — The Digital Merchant](https://thedigitalmerchant.com/easypost-vs-shippo/)
- [PostNord Developer Portal](https://developer.postnord.com/apis/details?systemName=shipment-v3-booking-sao)
- [PostNord Shipping APIs](https://www.postnord.com/insights/shipping-guides/shipping-api/)
