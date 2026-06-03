# Knowledge Graph — AICOS

Relationships across the platform so complexity is understandable at a glance. Authoritative entity names: `prisma/schema.prisma`; modules: `../master-brain/module-map.md`.

## Feature → Module → Data → API → Integration → Revenue → AI

| Capability | Primary module(s) | Key tables | API base | Integrations | Revenue link | AI agent |
|-----------|-------------------|-----------|----------|--------------|--------------|----------|
| Video → catalog extraction ★ | ai-extraction, ai-core, media, catalog, inventory | extraction_jobs, extraction_frames, extraction_results, extraction_review_items, media_assets, product_embeddings | /extraction-jobs, /catalog-drafts | Gemini, Claude, OpenAI, ZXing+Open Food Facts, R2/MinIO | AI usage credits | Extraction, Product, Compliance |
| Sell products (commerce core) | catalog, inventory, orders, payments, storefront | products, product_variants, inventory_items, orders, payments, carts | /products, /orders, /payments, /storefront | Stripe Connect+Tax+Checkout | GMV transaction fee | — |
| SaaS subscriptions & credits | billing, iam | plans, subscriptions, invoices, credit_balances, credit_transactions | /billing | Stripe Billing | Tiered subscriptions + AI credits | — |
| Multi-tenant identity & access | iam | tenants, users, roles, memberships, sessions, api_keys | /auth, /tenants, /team | Google OAuth | (enables all) | — |
| Search & discovery | search, catalog | search_sync_jobs, product_embeddings | /search | Meilisearch (per-tenant tokens) | — | — |
| AI content & SEO | content, catalog | products (SEO fields), product_images | /content, /seo | Claude, Gemini | AI credits | Content, SEO |
| Store generation & theming | store-builder, theme-engine, storefront | theme_configs (+ deferred builder tables) | /store-builder, /themes | Claude + image model | Theme marketplace (future) | Design |
| Google ecosystem sync | google, analytics | oauth_connections, integration_connections, analytics_snapshots | /integrations/google | Merchant API v1, GBP, GA4, GSC, GTM, Maps | — | Google |
| Marketing & ads | marketing, content | ad_campaigns | /marketing | Meta, TikTok, Pinterest, Google Ads | Integrations marketplace | Marketing |
| Customer service | customer-service, orders, customers | (Conversation/Ticket — deferred P4) | /cs, /chat | Claude, Gemini | — | Customer Service |
| Pricing intelligence | pricing, analytics | (PriceSuggestion — deferred P4) | /pricing | Claude | — | Pricing |
| Analytics & forecasting | analytics, inventory | analytics_snapshots | /analytics | GA4 | — | Analytics, Inventory |
| Shipping & fulfillment | shipping, orders | shipments | /shipping, /shipments | Shippo, PostNord, EasyPost | — | — |
| Returns & disputes | orders, payments | returns, return_items, disputes, dispute_evidence | /orders/:id/returns, /disputes | Stripe | (protects margin) | — |
| Automation | automation | automations, automation_runs | /automations | (cross-module) | — | (orchestrates agents) |
| Compliance & audit | cross-cutting | audit_logs, dsar_requests, webhook_endpoints | /audit-logs, /webhooks | Doppler (secrets) | — | Compliance |

## Invariant relationships (never violate)
- **Every tenant-scoped table → `tenant_id` + RLS.** No table escapes tenant isolation; `withTenant()` is the only sanctioned DB path. ([[tenant-model]])
- **Every AI call → `ai_usage_events` → `credit_transactions`.** AI spend is always metered and credit-deducted (cost governance). ([[ai-provider-abstraction]])
- **Publish → human gate.** `extraction_review_items` / approval precedes any write to live `products`; JOB 6 (publish) fires only on explicit user action. ([[ai-product-extraction]])
- **Money → integer cents; AI cost → micros.** No Decimal/Float for money anywhere.
- **External identity is per-tenant.** Stripe `connect_accounts`, Google `oauth_connections`, Meilisearch tenant tokens — all tenant-isolated.

## Dependency backbone (build order)
`iam` → `billing` → (`media`, `catalog`) → (`inventory`, `search`) → `orders` → (`payments`, `shipping`, `customers`) → (`admin`, `storefront`) → `ai-core` → `ai-extraction` ★ → `content` → (`store-builder`, `theme-engine`) → (`google`, `marketing`, `customer-service`, `pricing`, `analytics`) → `automation`.
