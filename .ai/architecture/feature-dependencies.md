# AICOS Feature Dependencies

> For each major feature: what it **depends on**, what it **blocks**, the **APIs** it requires, and the **DB objects** it needs.
> This is the build-order contract. Respect it and the critical paths in `complexity-map.md` resolve cleanly.

---

## 1. Module dependency graph (build order)

Arrows point **from dependent → dependency** ("needs"). Topological build order is left-to-right by phase.

```
P0 ─────────────────────────────────────────────────────────────────────────
  iam ──(none; foundation)
  media ── iam
  billing ── iam
  notifications ── iam

P1 ─────────────────────────────────────────────────────────────────────────
  catalog ── iam, media
  inventory ── catalog
  search ── catalog
  customers ── iam, (orders)
  orders ── catalog, inventory, customers
  payments ── orders, iam, billing
  shipping ── orders
  storefront ── catalog, inventory, search, payments, media
  admin ── iam, catalog, orders, billing

P2 ─────────────────────────────────────────────────────────────────────────
  ai-core ── iam, billing
  ai-extraction ★ ── ai-core, media, catalog, inventory
  content ── ai-core, catalog

P3 ─────────────────────────────────────────────────────────────────────────
  theme-engine ── ai-core, storefront
  store-builder ── ai-core, catalog, theme-engine, content

P4 ─────────────────────────────────────────────────────────────────────────
  analytics ── orders, customers, catalog
  google ── iam, catalog, storefront, analytics
  pricing ── ai-core, catalog, analytics, inventory
  customer-service ── ai-core, orders, catalog, customers
  marketing ── ai-core, content, analytics, customers

P5 ─────────────────────────────────────────────────────────────────────────
  automation ── orders, inventory, notifications, ai-core
```

**Critical chain (longest path to the north star):**
`iam → media → catalog → ai-core → ai-extraction → content → (human gate) → publish → search → storefront`.

---

## 2. Feature-level dependency table

| Feature | Module | Depends on | Blocks | Required APIs (external) | Required DB objects |
|---|---|---|---|---|---|
| **Tenant signup + RLS context** | iam | — | EVERYTHING | — | `Tenant`, `User`, `Membership`, `Role`, `Session`; RLS policies; `app.current_tenant` GUC |
| **JWT auth (RS256) + RBAC** | iam | tenant signup | all authed features | — | `Session`, `ApiKey`, key store |
| **Subscription plans + entitlements** | billing | iam | AI credit gating, plan limits | Stripe Billing | `Plan`, `Subscription`, `Entitlement` |
| **AI credit ledger + metered usage** | billing | plans | every AI feature (P2+) | Stripe metered events | `CreditLedger`, `UsageMeter`, `AiUsageEvent` |
| **Pre-signed multipart upload** | media | iam | video upload, image storage | R2/S3/MinIO | `MediaAsset`, `UploadSession`; `temp/` lifecycle rule |
| **Transactional email** | notifications | iam | order confirmations, DSAR, alerts | SMTP/SendGrid | `NotificationTemplate`, `NotificationLog` |
| **Product + variant CRUD** | catalog | iam, media | inventory, orders, search, extraction publish, content | — | `Product`, `ProductVariant`, `Option`, `OptionValue`, `Category`, `PriceList` |
| **Draft↔Published lifecycle** | catalog | product CRUD | the human-gate publish step | — | `Product.status`, publish audit |
| **Stock levels + reservations** | inventory | catalog | orders (oversell guard), pricing | — | `InventoryItem`, `Reservation`, `StockLocation`, `StockAdjustment` |
| **Search index + tenant tokens** | search | catalog | storefront search | Meilisearch | `IndexState`; Meili index per tenant |
| **Customer accounts + portal** | customers | iam | orders, CS agent, marketing | — | `Customer`, `Address`, `CustomerConsent` |
| **GDPR DSAR export/erase** | customers | customer accounts | EU launch | — | `DsarRequest`; retention job |
| **Cart → order state machine** | orders | catalog, inventory, customers | payments, shipping, analytics | — | `Cart`, `CartLine`, `Order`, `OrderLine`, `Return`, `Refund` |
| **Split-payment-ready order model** | orders | order model | P2 multi-seller cart | — | `OrderLine.tenantId`/seller fields |
| **Stripe Connect onboarding (Accounts v2)** | payments | iam, billing | checkout, payouts | Stripe `/v2/core/accounts`, AccountLink | `ConnectAccount` |
| **Checkout (embedded, destination charge)** | payments | Connect, orders | money in, GMV | Stripe Checkout, Tax | `PaymentIntentRef`; `automatic_tax` |
| **Webhooks (HMAC, replay-safe)** | payments | checkout | order fulfillment | Stripe webhooks | `webhooks` queue; event-id dedup store |
| **Refunds + dispute evidence** | payments | webhooks | chargeback defense | Stripe refund/dispute | `Dispute`; reverse_transfer logic |
| **Rate shopping + labels + tracking** | shipping | orders | fulfillment | Shippo (P1), PostNord (P2) | `Shipment`, `ShipmentRecord`, `Parcel`, `CarrierAccount` |
| **Public storefront + product pages** | storefront | catalog, inventory, search, media | shopper purchase, SEO | — | `StoreSettings`, `StorePage` |
| **Direct-to-Meili search (frontend)** | storefront | search tenant tokens | fast search UX | Meilisearch | tenant token (1h TTL) |
| **Admin dashboard + ops** | admin | iam, catalog, orders, billing | owner self-service | — | `AdminPreference` (reads across modules) |
| **AI provider gateway + fallback** | ai-core | iam, billing | ALL AI features | OpenAI/Anthropic/Gemini | `AiProviderConfig`, `AiUsageEvent` |
| **★ Video → catalog extraction pipeline** | ai-extraction | ai-core, media, catalog, inventory | the entire north star | Gemini/Claude (via ai-core), ZXing/OpenFoodFacts | `ExtractionJob`, `ExtractionFrame`, `ExtractedProductDraft`, `FieldConfidence`; pgvector |
| **Confidence-scored human review gate** | ai-extraction + admin | extraction merge | publish (NON-negotiable) | — | `FieldConfidence`, review queue state |
| **Publish (explicit)** | ai-extraction | human gate | live store | — | writes `catalog`/`inventory`/`media`; triggers Meili reindex + sitemap |
| **AI descriptions + SEO** | content | ai-core, catalog | store quality, Merchant feed quality | Gemini/Claude (via ai-core) | `ContentDraft`, `SeoMeta`; DOMPurify on output |
| **AI theme generation** | theme-engine | ai-core, storefront | store-builder | Gemini/Claude (via ai-core) | `Theme`, `ThemeTokens` |
| **AI store builder + cloning** | store-builder | ai-core, catalog, theme-engine, content | full auto-store | Gemini/Claude (via ai-core) | `StoreBlueprint`, `BuilderJob` |
| **Analytics events + dashboards** | analytics | orders, customers, catalog | pricing, marketing, forecasting | GA4 (reconcile) | `AnalyticsEvent`, `MetricSnapshot`, `Forecast` |
| **Google OAuth + token vault** | google | iam | all Google features | Google OAuth | `OAuthConnection` (encrypted tokens, `granted_scopes[]`) |
| **Merchant feed (v1)** | google | OAuth, catalog, content | Google Shopping visibility | Merchant API v1 | `MerchantSyncState` |
| **GA4 server events / GBP / GSC / GTM / Maps** | google | OAuth (most), catalog/storefront | local presence, tracking, indexing | GA4 MP, GBP, GSC, GTM, Maps | `GbpLocation`; ga4/gsc/gtm fields on `OAuthConnection` |
| **AI pricing suggestions (advisory)** | pricing | ai-core, catalog, analytics, inventory | owner-approved price changes | Gemini/Claude (via ai-core) | `PriceSuggestion`, `PricingRule` |
| **AI customer-service agent** | customer-service | ai-core, orders, catalog, customers | storefront support | Gemini/Claude (via ai-core) | `Conversation`, `CsMessage`, `Escalation` |
| **AI marketing agent + ad sync** | marketing | ai-core, content, analytics, customers | paid acquisition | Meta/TikTok/Pinterest/Google Ads | `Campaign`, `AdCreative`, `ChannelConnection` |
| **Automation workflows** | automation | orders, inventory, notifications, ai-core | hands-off ops | — | `Workflow`, `WorkflowRun`, `TriggerLog` |

---

## 3. "Blocks" view — what cannot ship until X exists

| If this is missing… | …these are blocked |
|---|---|
| `iam` tenant context + RLS | **everything** |
| `media` upload | catalog images, ai-extraction (video) |
| `catalog` | inventory, search, orders, storefront, ai-extraction publish, content, pricing, marketing, google feed |
| `billing` credit ledger | every AI feature (no cost governance = no AI) |
| `ai-core` | ai-extraction, content, store-builder, theme-engine, pricing, customer-service, marketing |
| Stripe Connect onboarding | checkout, payouts, all GMV |
| Human verification gate | publish (and therefore the north star) |
| `analytics` | pricing, marketing, forecasting |
| Google OAuth verification (P3) | all P4 Google features (Merchant feed deadline Aug 18 2026) |

---

## 4. Required-DB-object summary (new infra dependencies)
- **pgvector extension** on the existing PostgreSQL 16 — required by `ai-extraction` JOB4 (CLIP embedding dedup). No new infrastructure.
- **RLS policies + `FORCE ROW LEVEL SECURITY`** on every tenant table — required by `iam` and inherited by all.
- **`temp/` object-store prefix with 48h lifecycle** — required by `media`/`ai-extraction`.
- **Meili index + tenant tokens** — required by `search`/`storefront`.
- **Event-ID dedup store (Redis/Postgres)** — required by `payments`/webhooks for replay safety.
- **AI usage event stream** (`AiUsageEvent` + `ai.usage` bus) — required by `ai-core`→`billing` for credit deduction.

---

## 5. External-API readiness gates (start dates that matter)
| Gate | Must start | Hard deadline | Owner |
|---|---|---|---|
| Create AICOS company Google Business Profile (60-day age) | **now (P0)** | — | google |
| Submit Google OAuth sensitive-scope verification | **P3** | before P4 launch | google |
| Build Merchant API **v1** (never Content API) | P4 | **Aug 18 2026** (Content API shutdown) | google |
| Stripe Connect Accounts v2 + dispute-evidence workflow | P1 | before Go Live | payments |
| Google Ads API (restricted scope, annual audit) | late P4 | — | marketing/google |
