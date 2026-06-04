# Runbook — Live third-party integrations (Phase 2 · P2.3)

How to take each external integration from the MVP's graceful-degradation mode to a
**live** run with real (test-mode) credentials. The code already degrades safely when
keys are absent; this is purely about wiring real credentials + verifying delivery.

| Integration | Status | Needs |
|-------------|--------|-------|
| **SMTP / email** (Mailhog) | ✅ **Live** — verified | nothing (local infra) |
| **Stripe** (Checkout + Connect + webhooks) | ⚙️ Ready — needs keys | Stripe **test** keys + Stripe CLI |
| **Shippo** (label purchase) | ⚙️ Manual flow live; auto-label needs key | Shippo **test** API key |

---

## 1. SMTP / Email — Mailhog (LIVE)

Local infra already provides Mailhog (SMTP `localhost:1200`, web UI `http://localhost:8100`).
The worker's `MailService` sends real email whenever `SMTP_HOST` is set (it is, in `.env`),
and **verifies the SMTP connection on boot** (`MailService.onModuleInit`).

**Run it:** `pnpm infra:up` then `pnpm dev`. Any order paid / shipped / refunded enqueues a
`notification.send` job; the worker renders the template and delivers it.

**Verify:** open **http://localhost:8100** (Mailhog UI) — you'll see order-confirmation,
shipment-tracking, and return emails. Or query the API:
`curl http://localhost:8100/api/v2/messages`. (CI/automated: see the live email smoke.)

Prod: swap `SMTP_HOST`/`SMTP_USER`/`SMTP_PASS`/`MAIL_FROM` for a real provider (SendGrid/SES).

---

## 2. Stripe — Checkout + Connect + webhooks (TEST MODE)

**Get keys** (Stripe Dashboard → Developers, in **test mode**):
- `STRIPE_SECRET_KEY=sk_test_...`
- `STRIPE_PUBLISHABLE_KEY=pk_test_...` (not required for hosted Checkout, but harmless)

**Forward webhooks** with the Stripe CLI (this prints the signing secret):
```
stripe login
stripe listen --forward-to localhost:4000/api/v1/webhooks/stripe
# → "Ready! Your webhook signing secret is whsec_..." — set it:
#   STRIPE_WEBHOOK_SECRET=whsec_...
```

Put the three values in `.env`, restart `pnpm dev`.

**Drive a real checkout:**
1. http://localhost:3000/shop → add to cart → http://localhost:3000/cart → Checkout.
2. You're redirected to Stripe Checkout — pay with test card `4242 4242 4242 4242`, any future
   expiry/CVC/ZIP.
3. Stripe fires `checkout.session.completed` → the CLI forwards it → the worker flips the order
   to **PAID**, writes the Payment, decrements stock, converts the cart, and emails the buyer.
4. Verify in the admin: **Orders** shows the order PAID; **Mailhog** shows the confirmation.

**Connect (destination charges):** in **Payments → Connect**, create the connected account +
onboarding link; complete the test onboarding. Set `PLATFORM_FEE_BPS` to take an application fee.
Refund from the admin **Orders** detail; `charge.refunded` reconciles via the webhook.

**Smoke (already automated, synthetic):** the contract smokes enqueue a signature-equivalent
`checkout.session.completed` to prove the worker lifecycle without Stripe. The CLI run above is
the *real* end-to-end.

---

## 3. Shippo — shipping labels (TEST MODE)

The **manual** shipment flow is live today: admin **Orders → Fulfillment** records a carrier +
tracking, marks the shipment shipped → order FULFILLED + buyer tracking email.

**Auto-label purchase** is now implemented (`ShippoService`): set `SHIPPO_API_KEY=shippo_test_...`
(Shippo Dashboard → API), then `POST /orders/:id/shipments { "buyLabel": true }`. With a key + a
ship-from (the default `InventoryLocation`'s address) + the order's shipping address, the service
creates a Shippo shipment, picks the **cheapest rate**, buys the label, and populates
`carrier`/`trackingNumber`/`trackingUrl`/`labelUrlCached`/`rateAmountCents`. Any failure (no key,
missing address, API error) **degrades to a manual shipment** so fulfillment is never blocked.

Live-run checklist (needs a test key):
1. `SHIPPO_API_KEY=shippo_test_...` in `.env`; restart.
2. Seed a **default** `InventoryLocation` with an `Address` (ship-from).
3. Ensure the order has a `shippingAddress` (Stripe Checkout collects it — capturing it back onto
   the order on `checkout.session.completed` is a small follow-up; until then pass addresses or set
   it manually).
4. `POST /orders/:id/shipments { "buyLabel": true }` → verify `labelUrlCached` + tracking populated.
Request shaping is unit-tested (`shippo.service.spec.ts`); verify field shapes against live Shippo
on first real run.

---

## Security note
Keep real keys out of git — they live in `.env` (gitignored) or a secrets manager (Doppler, P2.5).
`.env.example` documents the variable names only.
