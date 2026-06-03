# AICOS Module Map

> Canonical registry of **all 24 modules**. Phase = P0 (Planning) → every module is **Planned / 0%**.
> `key` matches the SPEC and is used as the directory/feature identifier everywhere in the codebase and `.ai/`.
> Owner = the responsible engineering surface (workstream), not a person.

---

## 1. Module registry (full)

| # | Key | Name | Purpose | Owner (workstream) | Phase | Status | % | Depends on |
|---|-----|------|---------|--------------------|-------|--------|---|------------|
| 1 | `iam` | Identity, Auth, RBAC & Multi-Tenancy | Tenants, users, sessions, JWT (RS256), RBAC roles, tenant context + Postgres RLS. The trust root for the entire platform. | Platform | P0 | Planned | 0 | — (foundation) |
| 2 | `billing` | SaaS Subscription Billing (platform) | Tiered plans (Starter/Growth/Pro/Enterprise), Stripe Billing, AI-credit ledger (extraction minutes + generation credits), metered usage, entitlements/quotas. | Platform | P0 | Planned | 0 | `iam` |
| 3 | `catalog` | Product Catalog & Variants | Products, variants, options, categories, pricing, attributes, GTIN/barcode, draft↔published lifecycle. Target of AI extraction. | Commerce | P1 | Planned | 0 | `iam`, `media` |
| 4 | `inventory` | Inventory Management | Stock levels per variant/location, reservations, adjustments, low-stock thresholds, oversell prevention. | Commerce | P1 | Planned | 0 | `catalog` |
| 5 | `orders` | Order Management | Cart→order lifecycle, line items, status machine, refunds/returns, multi-store cart data model (split payment ready). | Commerce | P1 | Planned | 0 | `catalog`, `inventory`, `customers` |
| 6 | `payments` | Payments (Stripe) | Stripe Connect (Accounts v2, destination charges), Checkout embedded, Stripe Tax, app fee, refunds w/ reverse_transfer, dispute evidence. | Commerce | P1 | Planned | 0 | `orders`, `iam`, `billing` |
| 7 | `shipping` | Shipping & Fulfillment | `ShippingProvider` interface; Shippo (P1) → PostNord/Bring direct (P2); rates, labels (cached to S3), tracking, fulfillment status. | Commerce | P1 | Planned | 0 | `orders` |
| 8 | `customers` | Customer Management & Portal | End-customer accounts per tenant, addresses, order history, self-serve portal, GDPR DSAR (export/erase). | Commerce | P1 | Planned | 0 | `iam`, `orders` |
| 9 | `storefront` | Storefront (customer web) | Public buyer experience: catalog browse, product pages, cart, checkout entry, account portal. Server BFF in api + `apps/web`. | Experience | P1 | Planned | 0 | `catalog`, `inventory`, `search`, `payments`, `media` |
| 10 | `admin` | Admin Dashboard | Owner/manager control plane: review gate UI, catalog/inventory/order mgmt, settings, billing, integrations. `apps/admin`. | Experience | P1 | Planned | 0 | `iam`, `catalog`, `orders`, `billing` |
| 11 | `search` | Search (Meilisearch) | Index sync from catalog, tenant-token generation (1h TTL), typo-tolerant faceted search; frontend queries Meili directly. | Commerce | P1 | Planned | 0 | `catalog` |
| 12 | `media` | Media & Storage | S3-compatible abstraction (MinIO/R2), pre-signed multipart upload, image transforms, temp/ lifecycle (48h), CDN delivery. | Platform | P1 | Planned | 0 | `iam` |
| 13 | `notifications` | Notifications (email/chat) | Transactional + lifecycle messaging via SMTP/SendGrid (Mailhog dev), templates, per-tenant sender identity, webhooks. | Platform | P1 | Planned | 0 | `iam` |
| 14 | `ai-core` | AI Provider Abstraction & Agent Orchestration | Single gateway to OpenAI/Anthropic/Gemini; model routing, fallback chain, rate-limit/backoff, JSON-schema validation, emits `ai.usage`. | AI | P2 | Planned | 0 | `iam`, `billing` |
| 15 | `ai-extraction` | AI Product Extraction Engine (video→catalog) **[FLAGSHIP]** | The magic: keyframe → barcode → multi-model vision → dedup → merge → draft products w/ per-field confidence. 5-stage BullMQ pipeline. | AI | P2 | Planned | 0 | `ai-core`, `media`, `catalog`, `inventory` |
| 16 | `content` | AI Content Generation (descriptions/SEO/pages) | Product descriptions, SEO titles/meta, category copy, pages — from extracted/entered data; DOMPurify-sanitized output. | AI | P2 | Planned | 0 | `ai-core`, `catalog` |
| 17 | `store-builder` | AI Store Builder + Website Cloning | Generate a full store from a name; visual-inspiration cloning (not copying); page/layout assembly. | AI | P3 | Planned | 0 | `ai-core`, `catalog`, `theme-engine`, `content` |
| 18 | `theme-engine` | AI Theme Generation | Dynamic theme/design tokens (color/type/layout) from brand inputs; renders into storefront via design system. | AI | P3 | Planned | 0 | `ai-core`, `storefront` |
| 19 | `google` | Google Ecosystem Integration | Merchant API v1 (feed), GBP, GA4 (Measurement Protocol + Admin), GSC, GTM, Maps, Google OAuth; per-tenant `oauth_connections`. | Growth | P4 | Planned | 0 | `iam`, `catalog`, `storefront`, `analytics` |
| 20 | `marketing` | AI Marketing Agent | Campaign generation + sync to Meta/TikTok/Pinterest/Google Ads; audience/creative suggestions; performance feedback loop. | Growth | P4 | Planned | 0 | `ai-core`, `content`, `analytics`, `customers` |
| 21 | `customer-service` | AI Customer Service Agent | Storefront/portal assistant grounded in tenant catalog + orders; escalation; human-in-loop handoff. | Growth | P4 | Planned | 0 | `ai-core`, `orders`, `catalog`, `customers` |
| 22 | `pricing` | AI Pricing Agent | Price suggestions from margins, competitor signals, demand; always advisory (owner approves before apply). | Growth | P4 | Planned | 0 | `ai-core`, `catalog`, `analytics`, `inventory` |
| 23 | `analytics` | Analytics & Business Intelligence | Event capture, GMV/AOV/conversion dashboards, AI inventory forecasting inputs, GA4 reconciliation. | Growth | P4 | Planned | 0 | `orders`, `customers`, `catalog` |
| 24 | `automation` | Automation Engine | Trigger→condition→action workflows across modules (e.g., low-stock→reorder draft, abandoned-cart→email). | Platform | P5 | Planned | 0 | `orders`, `inventory`, `notifications`, `ai-core` |

---

## 2. Module → API surface / DB ownership / key features

> **Table names below are authoritative as of the 54-model schema in `prisma/schema.prisma` / `database-registry.md`. Entities for later-phase modules (P3–P4) may be marked (deferred).** Tables are listed in canonical `snake_case` exactly as they appear in the schema. Modules whose entities are not yet in the schema (e.g. `store-builder`, `customer-service`, `pricing`, and parts of `marketing`/`analytics`/`notifications`) list **planned** entity names tagged `(deferred to <phase>)`. For counts and full relationships, see `database-registry.md` (authoritative).

| Key | Primary API surface (REST namespaces) | DB tables it owns (primary) | Key features |
|-----|----------------------------------------|------------------------------|--------------|
| `iam` | `/auth/*`, `/tenants/*`, `/users/*`, `/roles/*` | `tenants`, `users`, `sessions`, `roles`, `memberships`, `api_keys` | Signup/login, JWT RS256 (90d rotation), RBAC, tenant context middleware, RLS policy owner |
| `billing` | `/billing/subscriptions`, `/billing/credits`, `/billing/usage`, `/billing/webhooks/stripe` | `plans`, `subscriptions`, `invoices`, `credit_balances`, `credit_transactions` | Plan tiers, Stripe Billing, AI-credit balance, metered events, quota enforcement |
| `catalog` | `/catalog/products`, `/catalog/variants`, `/catalog/categories` | `stores`, `categories`, `brands`, `products`, `product_categories`, `product_variants`, `product_images`, `product_embeddings`, `product_reviews` | Variant matrix, draft/published lifecycle, GTIN, attributes |
| `inventory` | `/inventory/items`, `/inventory/adjustments`, `/inventory/locations` | `inventory_locations`, `inventory_items`, `stock_movements` | Per-variant stock, reservations, low-stock alerts, oversell guard |
| `orders` | `/orders`, `/carts`, `/orders/:id/returns` | `carts`, `cart_items`, `orders`, `order_items` | Status machine, returns/refunds, split-payment-ready lines |
| `payments` | `/payments/checkout`, `/payments/connect`, `/payments/webhooks/stripe` | `payments`, `refunds`, `discounts`, `gift_cards` | Connect Accounts v2, Checkout embedded, Tax, app fee, dispute evidence |
| `shipping` | `/shipping/rates`, `/shipping/labels`, `/shipping/tracking` | `shipments` | Provider interface, rate shopping, label cache to S3, tracking webhooks |
| `customers` | `/customers`, `/customers/me`, `/customers/me/dsar` | `customers`, `addresses` (DSAR via cross-cutting `dsar_requests`) | Portal, addresses, consent, DSAR export/erase |
| `storefront` | `/store/*` (BFF), public read endpoints | _(no owned tables; reads catalog/inventory; storefront container is `stores`, owned by `catalog`)_ | Public browse, product pages, cart entry, theme application |
| `admin` | `/admin/*` (BFF aggregations) | _(no owned tables; reads across modules)_ | Review gate UI, ops dashboards, integration config |
| `search` | `/search/token`, `/search/reindex` | `search_sync_jobs` (Postgres→Meili outbox; no source-of-truth tables) | Meili sync, tenant tokens, faceting |
| `media` | `/media/upload-url`, `/media/assets` | `media_assets` | Pre-signed multipart, transforms, lifecycle rules |
| `notifications` | `/notifications/templates`, `/notifications/send` | `notifications`; planned `notification_templates` (deferred to P1+) | Email send, templates, sender identity |
| `ai-core` | `/ai/health` (internal SDK, not public CRUD) | `ai_agent_runs`, `ai_usage_events` | Provider routing, fallback, schema validation, usage metering |
| `ai-extraction` | `/extraction/jobs`, `/extraction/jobs/:id/review` | `extraction_jobs`, `extraction_frames`, `extraction_results`, `extraction_review_items` | 5-stage pipeline, confidence scoring, merge/split, review queue |
| `content` | `/content/generate`, `/content/jobs` | _(no owned tables; writes `products` SEO/copy fields; runs tracked in `ai_agent_runs`)_ | Descriptions, SEO, page copy, sanitization |
| `store-builder` | `/store-builder/generate`, `/store-builder/clone` | planned `store_blueprints`, `builder_jobs` (deferred to P3) | Name→store, visual cloning, layout assembly |
| `theme-engine` | `/themes/generate`, `/themes/:id` | `theme_configs` | Design-token generation, theme preview |
| `google` | `/integrations/google/*`, `/integrations/google/oauth/callback` | `oauth_connections`, `integration_connections` | Merchant feed, GBP, GA4, GSC, GTM, Maps, OAuth (partial-grant aware) |
| `marketing` | `/marketing/campaigns`, `/marketing/channels` | `ad_campaigns`; channel auth via `integration_connections`; planned `ad_creatives` (deferred to P4) | Campaign gen, ad-channel sync, performance loop |
| `customer-service` | `/cs/conversations`, `/cs/messages` | planned `conversations`, `cs_messages`, `escalations` (deferred to P4) | Grounded assistant, escalation, handoff |
| `pricing` | `/pricing/suggestions`, `/pricing/apply` | planned `price_suggestions`, `pricing_rules` (deferred to P4) | Advisory pricing, owner-approval apply |
| `analytics` | `/analytics/dashboards`, `/analytics/events` | `analytics_snapshots`; planned `analytics_events` (deferred to P4) | Dashboards, forecasting inputs, GA4 reconcile |
| `automation` | `/automation/workflows`, `/automation/runs` | `automations`, `automation_runs` | Trigger→condition→action graph, cross-module actions |

> **Every owned table carries `tenant_id` with `FORCE ROW LEVEL SECURITY` and composite indexes `@@index([tenantId])` + `@@index([tenantId, createdAt])`.** Global / platform-scoped tables (`plans`, and the cross-cutting `webhook_endpoints`, `webhook_deliveries`, `audit_logs`, `dsar_requests`) are documented in `database-registry.md` as the authoritative source; `audit_logs` is tenant-nullable for platform events.

---

## 3. Ownership / workstream summary
| Workstream | Modules | Phase span |
|---|---|---|
| **Platform** | iam, billing, media, notifications, automation | P0 → P5 |
| **Commerce** | catalog, inventory, orders, payments, shipping, customers, search | P1 |
| **Experience** | storefront, admin | P1 (themed in P3) |
| **AI** | ai-core, ai-extraction, content, store-builder, theme-engine | P2 → P3 |
| **Growth** | google, marketing, customer-service, pricing, analytics | P4 |

---

## 4. Status legend
- **Planned** — designed in `.ai/`, no code. (All 24 modules are here in P0.)
- **In Progress** — scaffolding/partial implementation.
- **Built** — feature-complete for its phase, tests passing.
- **Hardened** — security/perf reviewed, production-ready.

_All modules are currently **Planned / 0%**. This is expected and correct for Phase 0._
