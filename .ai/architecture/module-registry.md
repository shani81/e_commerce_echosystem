# SaaS Module Registry — AICOS

Enterprise module registry (governance). **Check this registry before creating new functionality — avoid duplicate capabilities.** Authoritative entity names live in `prisma/schema.prisma`; module narrative in `../master-brain/module-map.md`. Status legend: 🟦 Planned · 🟨 In Progress · 🟩 Completed · 🟥 Blocked.

| Module | Phase | Purpose | Depends on | API base | Owned tables | Status |
|--------|------|---------|-----------|----------|--------------|--------|
| **iam** | P0 | Tenants, users, sessions, JWT (RS256), RBAC, tenant context + Postgres RLS — the trust root | — | `/auth /tenants /users /team /api-keys /platform` | tenants, users, sessions, roles, memberships, api_keys | 🟦 |
| **billing** | P0 | Tiered plans, Stripe Billing, AI-credit ledger, metered usage, entitlements/quotas | iam | `/billing` | plans, subscriptions, invoices, credit_balances, credit_transactions | 🟦 |
| **catalog** | P1 | Products, variants, options, categories, brands, draft→published lifecycle, SEO; target of AI extraction | iam, media | `/products /variants /categories /collections /brands /attributes` | stores, categories, brands, products, product_categories, product_variants, product_images, product_embeddings, product_reviews | 🟦 |
| **inventory** | P1 | Stock per variant×location, reservations, adjustments, low-stock, oversell prevention | catalog | `/inventory /locations /stock-adjustments` | inventory_locations, inventory_items, stock_movements | 🟦 |
| **orders** | P1 | Cart→order lifecycle, status machine, returns/RMA, split-payment-ready model | catalog, inventory, customers | `/orders /carts /draft-orders` | carts, cart_items, orders, order_items, returns, return_items | 🟦 |
| **payments** | P1 | Stripe Connect (destination charges), Checkout, Tax, refunds, disputes/chargebacks | orders, iam, billing | `/payments /connect /coupons /gift-cards /webhooks/stripe` | payments, refunds, discounts, gift_cards, connect_accounts, disputes, dispute_evidence | 🟦 |
| **shipping** | P1 | ShippingProvider interface; Shippo (P1) then PostNord/Bring (P2); rates, labels, tracking | orders | `/shipping /shipments /webhooks/shippo` | shipments | 🟦 |
| **customers** | P1 | End-customer accounts per tenant, addresses, portal, GDPR DSAR | iam, orders | `/customers /portal` | customers, addresses | 🟦 |
| **storefront** | P1 | Public buyer experience: browse, product pages, cart, checkout entry, portal | catalog, inventory, search, payments, media | `/storefront` | (consumes catalog/orders) | 🟦 |
| **admin** | P1 | Owner/manager control plane incl. the human review gate UI | iam, catalog, orders, billing | `/dashboard` | (consumes all) | 🟦 |
| **search** | P1 | Meilisearch index sync, per-tenant tokens (1h TTL), faceted search | catalog | `/search` | search_sync_jobs | 🟦 |
| **media** | P1 | S3/R2 abstraction, pre-signed multipart upload, transforms, temp lifecycle, CDN | iam | `/media` | media_assets | 🟦 |
| **notifications** | P1 | Transactional + lifecycle messaging via SMTP/SendGrid, templates | iam | `/notifications /templates` | notifications (templates+prefs deferred) | 🟦 |
| **ai-core** | P2 | Single gateway to OpenAI/Anthropic/Gemini; routing, fallback, schema validation, `ai.usage` events | iam, billing | `/ai` | ai_agent_runs, ai_usage_events | 🟦 |
| **ai-extraction ★** | P2 | FLAGSHIP: video→draft catalog, 5-stage BullMQ pipeline, per-field confidence, never auto-publishes | ai-core, media, catalog, inventory | `/extraction-jobs /catalog-drafts` | extraction_jobs, extraction_frames, extraction_results, extraction_review_items | 🟦 |
| **content** | P2 | AI descriptions, SEO titles/meta, page copy; DOMPurify-sanitized | ai-core, catalog | `/content /seo` | (writes catalog fields) | 🟦 |
| **store-builder** | P3 | Generate full store from a name; visual-inspiration cloning (not copying) | ai-core, catalog, theme-engine, content | `/store-builder` | (builder/page/clone tables deferred P3) | 🟦 |
| **theme-engine** | P3 | Dynamic theme/design tokens from brand inputs; renders via design system | ai-core, storefront | `/themes` | theme_configs | 🟦 |
| **google** | P4 | Merchant API v1, GBP, GA4, GSC, GTM, Maps, OAuth; per-tenant connections | iam, catalog, storefront, analytics | `/integrations/google` | oauth_connections, integration_connections | 🟦 |
| **marketing** | P4 | Campaign generation + sync to Meta/TikTok/Pinterest/Google Ads | ai-core, content, analytics, customers | `/marketing` | ad_campaigns | 🟦 |
| **customer-service** | P4 | Storefront/portal assistant grounded in tenant catalog + orders; human handoff | ai-core, orders, catalog, customers | `/cs /chat` | (Conversation/Ticket deferred P4) | 🟦 |
| **pricing** | P4 | Advisory price suggestions; owner approves before apply | ai-core, catalog, analytics, inventory | `/pricing` | (PriceSuggestion/Rule deferred P4) | 🟦 |
| **analytics** | P4 | Event capture, GMV/AOV/conversion dashboards, forecasting inputs | orders, customers, catalog | `/analytics` | analytics_snapshots (events/forecast deferred) | 🟦 |
| **automation** | P5 | Trigger→condition→action workflows across modules | orders, inventory, notifications, ai-core | `/automations` | automations, automation_runs | 🟦 |
| **cross-cutting** | all | Outbound webhooks, immutable audit, GDPR DSAR | — | `/webhooks /audit-logs` | webhook_endpoints, webhook_deliveries, audit_logs, dsar_requests | 🟦 |

**Totals:** 24 modules · 59 Prisma models · 317 API endpoints (26 groups). Deferred-by-phase entities are tracked in `../database/schema-design.md` → "Schema Deferred to Phase".
