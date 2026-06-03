# AICOS — Database Table Registry

**Status:** DRAFT (Phase 0). Generated from `prisma/schema.prisma`.
**Date:** 2026-06-03
**Total tables:** 59 (57 entity models + 2 join tables already counted as models).
**Legend:** **T?** = tenant-scoped (carries `tenantId` + `@@index([tenantId])` and, where time-ordered, `@@index([tenantId, createdAt])`). Global = not tenant-scoped.

> Convention: every tenant table is protected by PostgreSQL RLS (`ENABLE` + `FORCE ROW LEVEL SECURITY`, `tenant_isolation` policy on `app.current_tenant`). See `schema-design.md` §3.

---

## Module → Phase map

| Module key | Module name | Phase | Tables (count) |
|---|---|---|---|
| iam | Identity, Auth, RBAC & Multi-Tenancy | P0 | tenants, users, sessions, roles, memberships, api_keys (6) |
| billing | SaaS Subscription Billing | P0 | plans, subscriptions, invoices, credit_balances, credit_transactions (5) |
| catalog | Product Catalog & Variants | P1 | stores*, categories, brands, products, product_categories, product_variants, product_images, product_embeddings, product_reviews (9) |
| inventory | Inventory Management | P1 | inventory_locations, inventory_items, stock_movements (3) |
| customers | Customer Management & Portal | P1 | customers, addresses (2) |
| orders | Order Management | P1 | carts, cart_items, orders, order_items, returns, return_items (6) |
| payments | Payments (Stripe) | P1 | payments, refunds, discounts, gift_cards, connect_accounts, disputes, dispute_evidence (7) |
| shipping | Shipping & Fulfillment | P1 | shipments (1) |
| media | Media & Storage | P1 | media_assets (1) |
| search | Search (Meilisearch) | P1 | search_sync_jobs (1) |
| notifications | Notifications (email/chat) | P1 | notifications (1) |
| ai-extraction | AI Product Extraction Engine [FLAGSHIP] | P2 | extraction_jobs, extraction_frames, extraction_results, extraction_review_items (4) |
| ai-core / content | AI Provider Abstraction + Content Gen | P2 | ai_agent_runs, ai_usage_events (2) |
| store-builder / theme-engine | AI Store Builder + Themes | P3 | theme_configs (1) |
| google / marketing | Google Ecosystem + AI Marketing | P4 | oauth_connections, integration_connections, ad_campaigns (3) |
| analytics | Analytics & BI | P4 | analytics_snapshots (1) |
| automation | Automation Engine | P5 | automations, automation_runs (2) |
| cross-cutting | Webhooks, Audit, Compliance | P0–P5 | webhook_endpoints, webhook_deliveries, audit_logs, dsar_requests (4) |

\* `stores` is the storefront/admin container; listed under catalog as its primary owner.

---

## Full table registry

| # | Table | Module | T? | Purpose | Key relationships |
|---|---|---|---|---|---|
| 1 | `tenants` | iam | Global (is tenant) | Root account per store owner; status, plan tier, data region, agency hierarchy | self → agency; 1:N nearly every table |
| 2 | `users` | iam | Global | Platform identity (login creds, MFA); may span tenants | 1:N memberships, sessions |
| 3 | `sessions` | iam | Global (per user) | Rotated refresh-token sessions; access JWTs are memory-only | N:1 user |
| 4 | `roles` | iam | T? (or global) | RBAC role; JSON `resource:action` permissions; persona-typed | N:1 tenant?; 1:N memberships |
| 5 | `memberships` | iam | T? | User↔Tenant join carrying a Role (authorization edge) | N:1 tenant, user, role |
| 6 | `api_keys` | iam | T? | Hashed programmatic API keys, scoped/expiring | N:1 tenant |
| 7 | `plans` | billing | Global | AICOS pricing plans + entitlement limits + included credits | 1:N subscriptions |
| 8 | `subscriptions` | billing | T? (1:1) | Tenant's Stripe Billing subscription mirror | N:1 plan; 1:N invoices |
| 9 | `invoices` | billing | T? | Platform invoice (subscription + metered AI), Stripe mirror | N:1 tenant, subscription |
| 10 | `credit_balances` | billing | T? | Current balance per credit type (extraction min / gen credits) | N:1 tenant; unique(tenant,type) |
| 11 | `credit_transactions` | billing | T? | Append-only credit ledger (grant/consume/expiry); AI cost truth | N:1 tenant |
| 12 | `stores` | catalog | T? | Storefront container; custom domain, geo, active theme | N:1 tenant, address; 1:N products/orders/carts |
| 13 | `categories` | catalog | T? | Self-referential category tree; AI-generatable | self tree; M:N products |
| 14 | `brands` | catalog | T? | Brand records | 1:N products |
| 15 | `products` | catalog | T? | Core product; status gated by human review; SEO; extraction provenance | N:1 tenant/store/brand; 1:N variants/images; 1:1 embedding/extractionResult |
| 16 | `product_categories` | catalog | T? | Product↔Category M:N join | N:1 product, category |
| 17 | `product_variants` | catalog | T? | Sellable variant; price/SKU/barcode/options; field confidence | N:1 product; 1:N inventory_items/order_items/cart_items |
| 18 | `product_images` | catalog | T? | Ordered product images w/ AI alt text | N:1 product, media_asset |
| 19 | `product_embeddings` | catalog | T? | pgvector(512) CLIP embedding for search + dedup | 1:1 product |
| 20 | `product_reviews` | catalog | T? | Customer reviews; moderation-gated | N:1 product, customer? |
| 21 | `inventory_locations` | inventory | T? | Stocking location (store/warehouse/pickup) | N:1 tenant, address?; 1:N inventory_items |
| 22 | `inventory_items` | inventory | T? | Stock per variant×location (onHand/reserved/reorder) | N:1 variant, location; 1:N movements; unique(variant,location) |
| 23 | `stock_movements` | inventory | T? | Append-only signed stock ledger | N:1 inventory_item, location |
| 24 | `customers` | customers | T? | End shopper (≠ platform User); GDPR processor data | N:1 tenant; 1:N addresses/orders/carts/reviews |
| 25 | `addresses` | customers | T? | Postal address (shipping/billing/pickup) | N:1 customer?; used by store/location |
| 26 | `carts` | orders | T? | Pre-checkout basket; abandonment tracking | N:1 store/customer; 1:N cart_items |
| 27 | `cart_items` | orders | T? | Cart line; unit price snapshot | N:1 cart, variant |
| 28 | `orders` | orders | T? | Order w/ money breakdown, app fee, address snapshots, 3 status axes | N:1 store/customer/discount; 1:N items/payments/refunds/shipments |
| 29 | `order_items` | orders | T? | Line item with purchase-time snapshots | N:1 order, variant?; 1:N return_items |
| 30 | `returns` | orders | T? | RMA lifecycle vs an order (REQUESTED→APPROVED→RECEIVED→REFUNDED/REJECTED) | N:1 order; 1:N return_items |
| 31 | `return_items` | orders | T? | Returned line referencing original order_item + qty | N:1 return, order_item |
| 32 | `payments` | payments | T? | Stripe Connect destination charge attempt | N:1 order; 1:N refunds, disputes |
| 33 | `refunds` | payments | T? | Refund w/ reverse_transfer / refund_application_fee flags | N:1 order, payment |
| 34 | `discounts` | payments | T? | Promotion/coupon (mirrors Stripe Coupon); AI-marketing-generatable | N:1 tenant; 1:N orders |
| 35 | `gift_cards` | payments | T? | Custom balance ledger (Stripe has no native gift card) | N:1 tenant |
| 36 | `connect_accounts` | payments | T? (1:1) | Per-tenant Stripe Connect account; charges/payouts/details + requirements | N:1 tenant; unique(tenant) |
| 37 | `disputes` | payments | T? | Chargeback/dispute vs a payment; liability + evidence deadline | N:1 payment; 1:N dispute_evidence |
| 38 | `dispute_evidence` | payments | T? | Single evidence item (text or media-backed) on a dispute | N:1 dispute |
| 39 | `shipments` | shipping | T? | Fulfillment via Shippo/PostNord; cached label URL | N:1 order |
| 40 | `media_assets` | media | T? | All S3/R2 objects (video, frames, images, theme assets); phash | N:1 tenant; used by product_images, extraction |
| 41 | `extraction_jobs` | ai-extraction | T? | FLAGSHIP: one upload → draft catalog; 5-stage pipeline; dedupKey idempotency | N:1 tenant, source media; 1:N frames/results/review_items |
| 42 | `extraction_frames` | ai-extraction | T? | Keyframe + per-frame AI analysis (blur, barcode, confidence) | N:1 job, media? |
| 43 | `extraction_results` | ai-extraction | T? | Deduplicated candidate product + per-field confidence + facing/qty estimate | N:1 job; 1:1 review_item, product |
| 44 | `extraction_review_items` | ai-extraction | T? | HUMAN VERIFICATION GATE (accept/edit/reject/merge/split) | N:1 job; 1:1 result |
| 45 | `ai_agent_runs` | ai-core | T? | One run of any of 12 AI agents; provider-agnostic; tokens/cost/latency | N:1 tenant; 1:N usage_events |
| 46 | `ai_usage_events` | ai-core | T? | Fine-grained `ai.usage` metering feeding billing credit deduction | N:1 tenant, agent_run? |
| 47 | `theme_configs` | theme-engine | T? | Versioned AI/edited theme (tokens/layout); clone provenance | N:1 tenant, store; unique(store,version) |
| 48 | `search_sync_jobs` | search | T? | Postgres→Meilisearch outbox/reconcile per entity | N:1 tenant |
| 49 | `notifications` | notifications | T? | Multi-channel notification (email/in-app/SMS/webhook/chat) | N:1 tenant |
| 50 | `oauth_connections` | google | T? | Per-tenant Google OAuth tokens (encrypted) + service IDs; partial-grant scopes | N:1 tenant; unique(tenant,provider) |
| 51 | `integration_connections` | google/shipping/marketing | T? | API-key integrations (Shippo/EasyPost/PostNord/SendGrid/ad APIs); secretRef | N:1 tenant; unique(tenant,provider) |
| 52 | `ad_campaigns` | marketing | T? | AI Marketing agent campaign; human-approval gated; perf rollup | N:1 tenant |
| 53 | `analytics_snapshots` | analytics | T? | Daily BI rollup per tenant/store (KPIs, AI cost) | N:1 tenant; unique(tenant,store,date) |
| 54 | `automations` | automation | T? | Trigger→conditions→actions rule; cron-schedulable | N:1 tenant; 1:N runs |
| 55 | `automation_runs` | automation | T? | Automation execution log | N:1 automation |
| 56 | `webhook_endpoints` | cross-cutting | T? | Outbound webhook registration (HMAC-signed) | N:1 tenant; 1:N deliveries |
| 57 | `webhook_deliveries` | cross-cutting | T? | Webhook delivery attempts + retries | N:1 endpoint |
| 58 | `audit_logs` | cross-cutting | T? (nullable) | Immutable audit trail (INSERT-only RULE → WORM later) | N:1 tenant?, user? |
| 59 | `dsar_requests` | cross-cutting | T? | GDPR export/erasure, 30-day SLA, worker-processed | N:1 tenant |

---

## Append-only / ledger tables (never updated in place)

`credit_transactions`, `stock_movements`, `ai_usage_events`, `audit_logs`, `webhook_deliveries`, `extraction_frames`. All indexed on `(tenantId, createdAt)` for time-range reporting.

## Tables holding money (integer cents — never Float)

`plans`, `subscriptions`(via plan), `invoices`, `product_variants`, `orders`, `order_items`, `payments`, `refunds`, `disputes`, `discounts`, `gift_cards`, `shipments`, `ad_campaigns`, `analytics_snapshots`. AI cost stored as USD **micros** in `extraction_jobs`, `ai_agent_runs`, `ai_usage_events`, `analytics_snapshots`.

## Tables with encrypted/secret-referencing columns

`users` (mfaSecret), `oauth_connections` (accessToken/refreshToken/ga4ApiSecret), `integration_connections` (secretRef → Doppler), `webhook_endpoints` (secret), `api_keys` (keyHash), `sessions` (refreshTokenHash).

## Human-verification-gated tables (nothing AI auto-publishes)

`extraction_review_items` (the gate) → `products` (status DRAFT→PENDING_REVIEW→ACTIVE), `ad_campaigns` (PENDING_APPROVAL), `theme_configs` (review before activate), `product_reviews` (moderation).
