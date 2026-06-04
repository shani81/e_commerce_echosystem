# Runbook — Live third-party integrations (Phase 2 · P2.3)

How to take each external integration from the MVP's graceful-degradation mode to a
**live** run with real (test-mode) credentials. The code already degrades safely when
keys are absent; this is purely about wiring real credentials + verifying delivery.

| Integration | Status | Needs |
|-------------|--------|-------|
| **SMTP / email** (Mailhog) | ✅ **Live** — verified | nothing (local infra) |
| **Stripe** (Checkout + Connect + webhooks) | ⚙️ Ready — needs keys | Stripe **test** keys + Stripe CLI |
| **Shippo** (label purchase) | ⚙️ Manual flow live; auto-label needs key | Shippo **test** API key |
| **Gemini vision** (AI extraction) | ⚙️ Ready — needs key | **Gemini API key** (Google AI Studio) |

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
3. The order's `shippingAddress` is captured **automatically**: Checkout collects it
   (`shipping_address_collection`, countries via `CHECKOUT_SHIPPING_COUNTRIES`) and the
   `checkout.session.completed` webhook persists it (plus a billing snapshot + buyer email) onto
   the order in the shape `ShippingService.toAddress()` reads.
4. `POST /orders/:id/shipments { "buyLabel": true }` → verify `labelUrlCached` + tracking populated.
Request shaping is unit-tested (`shippo.service.spec.ts`); verify field shapes against live Shippo
on first real run.

---

## 4. Gemini vision — AI product extraction (LIVE-READY)

The flagship extraction loop (admin **AI Extraction** → upload a shelf video → AI drafts a
catalog → human review → accept to DRAFT) is fully wired. The worker samples real frames with
ffmpeg (JOB 1) and sends them to **Gemini vision**; the only thing missing for a live run is the
API key.

### Which Gemini API — exactly

- **API:** Google **Gemini API** (a.k.a. the **Generative Language API**), endpoint
  `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`.
  This is the **Google AI Studio** key path — **NOT Vertex AI** (Vertex uses GCP
  service-account OAuth; we use a simple API key in the query string).
- **Where to get it:** **Google AI Studio → Get API key** → https://aistudio.google.com/apikey
  (create a key; the free tier is rate-limited but works for testing). No GCP project/billing
  setup required for the AI Studio key.
- **Model:** `gemini-2.5-flash` (default; used for both chat + vision). Override via `GEMINI_MODEL`
  (e.g. `gemini-flash-latest` to always track the newest flash and avoid breakage when a version is
  retired) or per call via `request.model`. Embeddings (`text-embedding-004`) are stubbed/unused here.
- **Capability used:** `:generateContent` with **inline image data**
  (`inline_data: { mime_type, data: <base64 frame> }`) and `responseMimeType: application/json`.

### Turn it on

1. `GEMINI_API_KEY=AIza...` in `.env` (already in `turbo.json` `globalEnv` + `.env.example`).
2. `pnpm infra:up` then `pnpm dev`.
3. Admin **AI Extraction** (`http://localhost:3100/extraction`) → **Upload & extract** a shelf
   video (or photo). The browser presigns a PUT to MinIO, confirms the asset, and starts the job.
4. The worker: `INGESTING` (downloads from MinIO, ffmpeg samples ≤6 frames @1fps) → `ANALYZING`
   (Gemini vision → JSON products) → `AWAITING_REVIEW`. Review the triage-band grid and
   **Accept → draft** each product; publish from **Catalog**. Nothing publishes on its own.

### Graceful fallback (no key / no media / decode error)

`ExtractionAnalyzer` falls back to a deterministic 3-product **mock**, and the processor falls back
to placeholder frames — so the pipeline + review gate stay exercisable without a key or real media.
Live vs. mock is logged per job: `… (N frames, live vision | mock …)`.

### Object-store CORS (already handled)

Browser presigned uploads PUT straight to MinIO from the app origin. MinIO is configured with
`MINIO_API_CORS_ALLOW_ORIGIN` (default `*` for dev — see `docker-compose.yml`); the preflight
(`OPTIONS` → `204` with `Access-Control-Allow-Origin`/`-Methods: PUT`/`-Headers: content-type`) is
**verified working**. In prod, set `MINIO_CORS_ALLOW_ORIGIN` to the admin + web origins. For
**R2/S3** instead of MinIO, add an equivalent bucket CORS rule (allow `PUT`, the app origins,
`content-type`).

**Verified (local):** real MinIO round-trip + ffmpeg sampling produces JPEG frames from an uploaded
clip; the `frame-sampler` unit/integration tests cover ffmpeg sampling in CI. The live Gemini call
itself is the only step that needs your key.

---

## 5. CLIP — semantic frame dedup (OPTIONAL, gated)

Above the pixel-level dHash dedup, the worker can drop **semantically** near-duplicate
frames (the same shelf shot from a slightly different angle/lighting) using CLIP image
embeddings. Like Gemini vision, the model lives behind a configured endpoint; without one
this is **disabled** and the pipeline uses dHash only — no native/model dependency ships.

### Turn it on

1. Stand up a CLIP inference server (any backend) that implements this contract:
   - **Request:** `POST {CLIP_EMBED_URL}` — `{ "model": "clip", "images": [{ "mimeType": "image/jpeg", "data": "<base64>" }] }`
   - **Response:** `{ "embeddings": number[][] }` — one vector per input image.
   (A tiny FastAPI/transformers or `open_clip` server, or a hosted service, works.)
2. Set in `.env` (already in `turbo.json` `globalEnv` + `.env.example`):
   - `CLIP_EMBED_URL=https://your-clip-server/embed`
   - `CLIP_API_KEY=...` (optional bearer)
   - `CLIP_DEDUP_THRESHOLD=0.92` (cosine ≥ this → same shot; lower = more aggressive)
3. `pnpm dev`. On each extraction the worker embeds the sampled frames and drops near-
   duplicates before the vision call — logged as `semantic dedup: N → M frames (CLIP)`.

### Graceful fallback

No `CLIP_EMBED_URL`, an endpoint error, or a vector/frame count mismatch → the frames pass
through unchanged (pixel dHash dedup still applies). The `SemanticDeduperService` never
throws and never returns an empty set, so extraction never regresses.

---

## Security note
Keep real keys out of git — they live in `.env` (gitignored) or a secrets manager (Doppler, P2.5).
`.env.example` documents the variable names only.
