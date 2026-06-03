# AICOS — API Registry

> **Status:** Planned (Phase 0 — planning). 0% built. Authoritative endpoint catalog for **AI Commerce OS (AICOS)**.
> **Last updated:** 2026-06-03
> **Conventions:** governed by [`../architecture/api-design.md`](../architecture/api-design.md). All paths are relative to **`/api/v1`**. All timestamps UTC RFC 3339, money = integer minor units + ISO-4217 currency, IDs = prefixed opaque strings.

## How to read this registry

- **Method + Path** — relative to `/api/v1`.
- **Purpose** — one line.
- **Request → Response** — shape *summary*, not full schema (full schema = OpenAPI). `{...}` = JSON body, `?` = query params, `[paged]` = cursor envelope (`data[] + pageInfo`).
- **Roles** — who may call it (see RBAC §4 of api-design). `Public` = no auth. `OWNER`=STORE_OWNER, `MGR`=STORE_MANAGER, `STAFF`=STORE_STAFF, `CUST`=CUSTOMER, `SUPER`=PLATFORM_SUPER_ADMIN, `AGENCY`=AGENCY_ADMIN, `SVC`=service/internal.
- **Consumers** — `admin`=apps/admin, `web`=apps/web storefront, `worker`=apps/worker, `ext`=external/integrations.

Module phases follow the spec: **P0** foundation, **P1** core commerce, **P2** AI extraction/magic, **P3** AI store builder, **P4** growth/intelligence, **P5** scale/enterprise.

---

## Cross-cutting / meta (Phase P0)

| Method | Path | Purpose | Request → Response | Roles | Consumers |
|---|---|---|---|---|---|
| GET | `/health/live` | Liveness | – → `{status}` | Public | infra |
| GET | `/health/ready` | Readiness (db/redis/meili/storage) | – → `{status, checks{}}` | Public | infra |
| GET | `/version` | Build/version/commit | – → `{version, commit, builtAt}` | Public | all |
| GET | `/me` | Current principal/tenant/roles | – → `{user, tenant, roles, scopes}` | Any auth | admin, web |
| GET | `/openapi.json` | OpenAPI 3.1 spec | – → spec | Public(dev)/gated | ext |
| GET | `/docs` | Swagger UI | – → html | Public(dev)/gated | ext |

---

# MODULE: iam — Identity, Auth, RBAC & Multi-Tenancy (P0)

**Base:** `/auth`, `/tenants`, `/users`, `/team`, `/api-keys`, `/platform`
**Consumers:** admin, web (customer auth), ext (API keys)

| Method | Path | Purpose | Request → Response | Roles | Consumers |
|---|---|---|---|---|---|
| POST | `/auth/signup` | Create tenant + owner account (store onboarding entry) | `{email, password, storeName, country}` → `201 {user, tenant, tokens}` | Public | admin |
| POST | `/auth/login` | Password login → tokens | `{email, password}` → `{accessToken, refreshExpiresAt}` (+refresh cookie) | Public | admin, web |
| POST | `/auth/refresh` | Rotate refresh → new access | refresh cookie → `{accessToken}` (+new refresh cookie) | Public(cookie) | admin, web |
| POST | `/auth/logout` | Revoke session | – → `204` | Any auth | admin, web |
| POST | `/auth/password/forgot` | Send reset email | `{email}` → `202` | Public | admin, web |
| POST | `/auth/password/reset` | Reset with token | `{token, newPassword}` → `204` | Public | admin, web |
| POST | `/auth/verify-email` | Confirm email | `{token}` → `204` | Public | admin, web |
| POST | `/auth/mfa/enroll` | Begin TOTP enrollment | – → `{secret, otpauthUrl}` | Any auth | admin |
| POST | `/auth/mfa/verify` | Confirm/enable MFA | `{code}` → `204` | Any auth | admin |
| GET | `/auth/oauth/:provider/start` | Begin Google OAuth (login) | `?redirect` → `302` | Public | admin, web |
| GET | `/auth/oauth/:provider/callback` | OAuth callback | `?code,state` → `302` + tokens | Public | admin, web |
| GET | `/tenants/current` | Current tenant profile/settings | – → `{tenant}` | OWNER, MGR, STAFF | admin |
| PATCH | `/tenants/current` | Update store profile/locale/currency | `{name?, locale?, currency?, address?, ...}` → `{tenant}` | OWNER, MGR | admin |
| GET | `/tenants/current/settings` | Feature flags / config | – → `{settings}` | OWNER, MGR | admin |
| PATCH | `/tenants/current/settings` | Update settings | `{...}` → `{settings}` | OWNER | admin |
| GET | `/users/me` | My profile | – → `{user}` | Any auth | admin, web |
| PATCH | `/users/me` | Update my profile | `{name?, locale?, avatar?}` → `{user}` | Any auth | admin, web |
| GET | `/team` | List team members | `?page,perPage` → `[offset]` | OWNER, MGR | admin |
| POST | `/team/invitations` | Invite teammate w/ role | `{email, role}` → `201 {invitation}` | OWNER, MGR | admin |
| POST | `/team/invitations/:id/accept` | Accept invite | `{token, password?}` → `{user, tokens}` | Public | admin |
| PATCH | `/team/:userId` | Change member role | `{role}` → `{member}` | OWNER | admin |
| DELETE | `/team/:userId` | Remove member | – → `204` | OWNER | admin |
| GET | `/api-keys` | List API keys (masked) | – → `[offset]` | OWNER | admin, ext |
| POST | `/api-keys` | Create key (shown once) | `{name, scopes[]}` → `201 {key, secretOnce}` | OWNER | admin |
| DELETE | `/api-keys/:id` | Revoke key | – → `204` | OWNER | admin |
| GET | `/platform/tenants` | List all tenants | `?status,query` → `[paged]` | SUPER, AGENCY | admin |
| POST | `/platform/tenants` | Provision tenant (agency) | `{storeName, ownerEmail, plan}` → `201 {tenant}` | SUPER, AGENCY | admin |
| POST | `/platform/tenants/:id/suspend` | Suspend tenant | `{reason}` → `{tenant}` | SUPER | admin |
| POST | `/platform/tenants/:id/restore` | Restore tenant | – → `{tenant}` | SUPER | admin |
| POST | `/platform/impersonate/:tenantId` | Break-glass impersonation (audited) | `{reason}` → `{scopedToken}` | SUPER | admin |
| GET | `/audit-logs` | Tenant audit trail (immutable) | `?actor,action,from,to` → `[paged]` | OWNER, MGR | admin |

---

# MODULE: billing — SaaS Subscription Billing (platform) (P0)

**Base:** `/billing`
**Consumers:** admin, ext (Stripe webhooks). **Stripe Billing** (platform revenue), separate from commerce payments.

| Method | Path | Purpose | Request → Response | Roles | Consumers |
|---|---|---|---|---|---|
| GET | `/billing/plans` | List SaaS tiers (Starter/Growth/Pro/Enterprise) | – → `{plans[]}` | Public | admin, web |
| GET | `/billing/subscription` | Current subscription + status | – → `{subscription, tier, periodEnd}` | OWNER | admin |
| POST | `/billing/subscription` | Subscribe / change tier (Idempotency-Key) | `{planId, interval}` → `{subscription, checkoutUrl?}` | OWNER | admin |
| POST | `/billing/subscription/cancel` | Cancel at period end | `{reason?}` → `{subscription}` | OWNER | admin |
| GET | `/billing/usage` | AI credits / extraction minutes balance | – → `{credits, extractionMinutes, period}` | OWNER, MGR | admin |
| POST | `/billing/credits/purchase` | Buy AI credit pack (Idempotency-Key) | `{packId}` → `{checkoutUrl}` | OWNER | admin |
| GET | `/billing/invoices` | List platform invoices | `?from,to` → `[paged]` | OWNER | admin |
| GET | `/billing/invoices/:id` | Invoice detail / PDF link | – → `{invoice, pdfUrl}` | OWNER | admin |
| GET | `/billing/portal` | Stripe customer portal link | – → `{url}` | OWNER | admin |
| GET | `/billing/payment-methods` | List saved methods | – → `{methods[]}` | OWNER | admin |
| POST | `/webhooks/stripe-billing` | Inbound Stripe Billing events (signed, raw body) | Stripe event → `200` | SVC | ext |
| GET | `/platform/billing/mrr` | Platform MRR/ARR overview | `?from,to` → `{mrr, arr, churn}` | SUPER | admin |
| GET | `/platform/billing/usage-meter` | Metered AI usage across tenants | – → `[paged]` | SUPER | admin |

---

# MODULE: catalog — Product Catalog & Variants (P1)

**Base:** `/products`, `/variants`, `/categories`, `/collections`, `/brands`, `/attributes`
**Consumers:** admin (manage), web (browse), worker (extraction writes drafts → catalog)

| Method | Path | Purpose | Request → Response | Roles | Consumers |
|---|---|---|---|---|---|
| GET | `/products` | List/filter products | `?status,category,brand,q,sort` → `[paged]` | OWNER, MGR, STAFF | admin |
| POST | `/products` | Create product (Idempotency-Key) | `{name, description?, price{}, categoryId?, brandId?, attributes{}}` → `201 {product}` | OWNER, MGR, STAFF | admin |
| GET | `/products/:id` | Product detail | – → `{product, variants[], media[], seo}` | OWNER, MGR, STAFF | admin |
| PATCH | `/products/:id` | Update product (If-Match) | `{...}` → `{product}` | OWNER, MGR, STAFF | admin |
| DELETE | `/products/:id` | Soft-delete product | – → `204` | OWNER, MGR | admin |
| POST | `/products/bulk` | Bulk create/update (Idempotency-Key, async) | `{items[]}` → `202 {job}` | OWNER, MGR | admin |
| POST | `/products/import` | Import CSV / WooCommerce / Shopify (async) | `multipart` or `{sourceUrl, format}` → `202 {job}` | OWNER, MGR | admin |
| GET | `/products/export` | Export catalog | `?format=csv` → `202 {job}` | OWNER, MGR | admin |
| GET | `/products/:id/variants` | List variants | – → `{variants[]}` | OWNER, MGR, STAFF | admin |
| POST | `/products/:id/variants` | Add variant (size/color/weight/package) | `{sku, options{}, price{}, barcode?}` → `201 {variant}` | OWNER, MGR, STAFF | admin |
| PATCH | `/variants/:id` | Update variant (If-Match) | `{...}` → `{variant}` | OWNER, MGR, STAFF | admin |
| DELETE | `/variants/:id` | Remove variant | – → `204` | OWNER, MGR | admin |
| GET | `/categories` | List categories (tree) | `?tree=true` → `{categories[]}` | OWNER, MGR, STAFF; Public(store) | admin, web |
| POST | `/categories` | Create category | `{name, parentId?, slug?}` → `201 {category}` | OWNER, MGR | admin |
| PATCH | `/categories/:id` | Update / reparent | `{name?, parentId?}` → `{category}` | OWNER, MGR | admin |
| DELETE | `/categories/:id` | Delete category | – → `204` | OWNER, MGR | admin |
| GET | `/collections` | List merchandising collections | – → `[paged]` | OWNER, MGR, STAFF; Public | admin, web |
| POST | `/collections` | Create collection (manual/rule-based) | `{name, rules?, productIds?}` → `201 {collection}` | OWNER, MGR | admin |
| GET | `/brands` | List brands | – → `[paged]` | OWNER, MGR, STAFF | admin |
| POST | `/brands` | Create brand | `{name, logoMediaId?}` → `201 {brand}` | OWNER, MGR | admin |
| GET | `/attributes` | List attribute definitions | – → `{attributes[]}` | OWNER, MGR | admin |
| POST | `/attributes` | Define attribute (e.g. color/size) | `{name, type, values[]}` → `201 {attribute}` | OWNER, MGR | admin |

---

# MODULE: inventory — Inventory Management (P1)

**Base:** `/inventory`, `/locations`, `/stock-adjustments`
**Consumers:** admin, worker (order decrements, low-stock events), ext

| Method | Path | Purpose | Request → Response | Roles | Consumers |
|---|---|---|---|---|---|
| GET | `/inventory` | Stock levels across variants/locations | `?variantId,locationId,lowStock` → `[paged]` | OWNER, MGR, STAFF | admin |
| GET | `/inventory/:variantId` | Stock for a variant | – → `{onHand, reserved, available, byLocation[]}` | OWNER, MGR, STAFF | admin |
| PATCH | `/inventory/:variantId` | Set/adjust stock (If-Match) | `{onHand?, delta?, locationId, reason}` → `{inventory}` | OWNER, MGR, STAFF | admin |
| POST | `/stock-adjustments` | Bulk stock adjustment (audited) | `{adjustments[], reason}` → `202 {job}` | OWNER, MGR | admin |
| GET | `/locations` | List stock locations/warehouses | – → `{locations[]}` | OWNER, MGR, STAFF | admin |
| POST | `/locations` | Create location | `{name, address, type}` → `201 {location}` | OWNER, MGR | admin |
| PATCH | `/locations/:id` | Update location | `{...}` → `{location}` | OWNER, MGR | admin |
| GET | `/inventory/alerts` | Low-stock / reorder alerts | – → `[paged]` | OWNER, MGR, STAFF | admin |
| POST | `/inventory/:variantId/reorder-point` | Set reorder threshold | `{threshold, target}` → `{inventory}` | OWNER, MGR | admin |
| GET | `/inventory/movements` | Stock movement ledger | `?variantId,from,to` → `[paged]` | OWNER, MGR | admin |

---

# MODULE: orders — Order Management (P1)

**Base:** `/orders`, `/orders/{id}/...`, `/carts`, `/draft-orders`
**Consumers:** admin (manage), web (checkout/cart), worker (fulfillment events), customer portal

| Method | Path | Purpose | Request → Response | Roles | Consumers |
|---|---|---|---|---|---|
| GET | `/orders` | List/filter orders | `?status,channel,from,to,customerId,sort` → `[paged]` | OWNER, MGR, STAFF | admin |
| GET | `/orders/:id` | Order detail | – → `{order, items[], payments[], shipments[], refunds[]}` | OWNER, MGR, STAFF | admin |
| POST | `/draft-orders` | Create draft order (manual) | `{customerId?, items[], notes?}` → `201 {order}` | OWNER, MGR, STAFF | admin |
| PATCH | `/orders/:id` | Edit order (If-Match) | `{items?, notes?, tags?}` → `{order}` | OWNER, MGR, STAFF | admin |
| POST | `/orders/:id/fulfill` | Create fulfillment (full/partial) | `{items[], locationId, trackingNumber?}` → `{fulfillment}` | OWNER, MGR, STAFF | admin |
| POST | `/orders/:id/cancel` | Cancel order | `{reason, restock?}` → `{order}` | OWNER, MGR | admin |
| POST | `/orders/:id/refunds` | Refund full/partial (Idempotency-Key) | `{amount?, items?, reason, restock?}` → `201 {refund}` | OWNER, MGR | admin |
| GET | `/orders/:id/timeline` | Order events/timeline | – → `{events[]}` | OWNER, MGR, STAFF | admin |
| POST | `/orders/:id/notes` | Add internal note | `{body}` → `201 {note}` | OWNER, MGR, STAFF | admin |
| POST | `/orders/:id/returns` | Create return/RMA | `{items[], reason}` → `201 {return}` | OWNER, MGR, STAFF; CUST(own) | admin, web |
| POST | `/orders/:id/exchanges` | Create exchange | `{returnItems[], newItems[]}` → `201 {exchange}` | OWNER, MGR, STAFF | admin |
| POST | `/carts` | Create/get storefront cart | `{items[]}` → `{cart}` | Public; CUST | web |
| PATCH | `/carts/:id` | Update cart items/qty | `{items[]}` → `{cart}` | Public; CUST | web |
| POST | `/carts/:id/checkout` | Begin checkout → Stripe session (Idempotency-Key) | `{email, shippingAddress, shippingRateId}` → `{clientSecret, orderId}` | Public; CUST | web |
| GET | `/orders/lookup` | Guest order lookup | `?orderNumber,email` → `{order}` | Public | web |

---

# MODULE: payments — Payments (Stripe) (P1)

**Base:** `/payments`, `/connect`, `/webhooks/stripe`
**Consumers:** web (checkout), admin (Connect onboarding, refunds), ext (Stripe). **Stripe Connect destination charges**; commerce flow, distinct from `billing`.

| Method | Path | Purpose | Request → Response | Roles | Consumers |
|---|---|---|---|---|---|
| POST | `/connect/accounts` | Provision tenant Connect account (Accounts v2, Idempotency-Key) | `{country, businessType}` → `201 {account}` | OWNER | admin |
| GET | `/connect/accounts/current` | Connect account status/requirements | – → `{account, chargesEnabled, payoutsEnabled, requirements}` | OWNER, MGR | admin |
| POST | `/connect/account-links` | Stripe-hosted onboarding link | `{returnUrl, refreshUrl}` → `{url}` | OWNER | admin |
| POST | `/payments/intents` | Create PaymentIntent for cart (Idempotency-Key) | `{cartId, amount, currency}` → `{clientSecret, paymentIntentId}` | Public; CUST | web |
| GET | `/payments/:id` | Payment status | – → `{payment, status}` | OWNER, MGR, STAFF | admin |
| POST | `/payments/:id/capture` | Capture authorized payment | – → `{payment}` | OWNER, MGR | admin |
| GET | `/payments/balance` | Connect balance / payouts | – → `{available, pending, payouts[]}` | OWNER | admin |
| POST | `/disputes/:id/evidence` | Submit chargeback evidence | `{evidence{}}` → `{dispute}` | OWNER, MGR | admin |
| GET | `/disputes` | List disputes/chargebacks | `?status` → `[paged]` | OWNER, MGR | admin |
| GET | `/payments/tax/preview` | Stripe Tax preview for cart | `{cartId, address}` → `{taxAmount, breakdown[]}` | Public; CUST | web |
| POST | `/webhooks/stripe` | Inbound Stripe commerce events (signed, raw body, async) | event → `200` | SVC | ext |
| GET | `/coupons` | List coupons/promo codes | – → `[paged]` | OWNER, MGR | admin |
| POST | `/coupons` | Create coupon (amount/%, limits) | `{code, type, value, maxRedemptions?, expiresAt?}` → `201 {coupon}` | OWNER, MGR | admin |
| POST | `/coupons/validate` | Validate code at checkout | `{code, cartId}` → `{valid, discount}` | Public; CUST | web |
| GET | `/gift-cards` | List gift cards (custom ledger) | – → `[paged]` | OWNER, MGR | admin |
| POST | `/gift-cards` | Issue gift card | `{amount, currency, recipientEmail?}` → `201 {giftCard}` | OWNER, MGR | admin |
| POST | `/gift-cards/redeem` | Redeem (partial supported) | `{code, amount, orderId}` → `{remainingBalance}` | Public; CUST | web |
| GET | `/gift-cards/:code/balance` | Check balance | – → `{balance}` | Public; CUST | web |

---

# MODULE: shipping — Shipping & Fulfillment (P1)

**Base:** `/shipping`, `/shipments`, `/webhooks/shippo`
**Consumers:** admin, web (rates at checkout), worker (tracking sync), ext (Shippo/PostNord). Behind a `ShippingProvider` abstraction (Shippo P1, PostNord direct P2).

| Method | Path | Purpose | Request → Response | Roles | Consumers |
|---|---|---|---|---|---|
| POST | `/shipping/rates` | Get live rates (carriers via Shippo) | `{from, to, parcels[]}` → `{rates[]}` | Public; CUST; STAFF | web, admin |
| GET | `/shipping/zones` | List shipping zones | – → `{zones[]}` | OWNER, MGR | admin |
| POST | `/shipping/zones` | Create zone + rate rules | `{name, countries[], rules[]}` → `201 {zone}` | OWNER, MGR | admin |
| GET | `/shipping/methods` | Configured methods (flat/free/carrier) | – → `{methods[]}` | OWNER, MGR; Public | admin, web |
| POST | `/shipping/methods` | Create method | `{name, type, price?, conditions?}` → `201 {method}` | OWNER, MGR | admin |
| POST | `/shipments` | Buy label / create shipment (Idempotency-Key) | `{orderId, rateId, parcels[]}` → `201 {shipment, labelUrl, tracking}` | OWNER, MGR, STAFF | admin |
| GET | `/shipments/:id` | Shipment + label + tracking | – → `{shipment, labelUrl, trackingStatus}` | OWNER, MGR, STAFF; CUST(own) | admin, web |
| POST | `/shipments/:id/void` | Void label / cancel | – → `{shipment}` | OWNER, MGR | admin |
| GET | `/shipments/:id/track` | Live tracking | – → `{events[], status}` | OWNER, MGR, STAFF; CUST(own) | admin, web |
| GET | `/shipping/carriers` | Available carriers (UPS/FedEx/DHL/USPS/PostNord/Bring) | – → `{carriers[]}` | OWNER, MGR | admin |
| POST | `/webhooks/shippo` | Inbound tracking webhooks (signed, async) | event → `200` | SVC | ext |

---

# MODULE: customers — Customer Management & Portal (P1)

**Base:** `/customers` (admin), `/portal/*` (customer-facing)
**Consumers:** admin (CRM), web (customer portal)

| Method | Path | Purpose | Request → Response | Roles | Consumers |
|---|---|---|---|---|---|
| GET | `/customers` | List/segment customers | `?segment,q,sort` → `[paged]` | OWNER, MGR, STAFF | admin |
| POST | `/customers` | Create customer | `{email, name?, phone?, addresses?}` → `201 {customer}` | OWNER, MGR, STAFF | admin |
| GET | `/customers/:id` | Customer 360 (orders/LTV/notes) | – → `{customer, orders[], stats, addresses[]}` | OWNER, MGR, STAFF | admin |
| PATCH | `/customers/:id` | Update customer | `{...}` → `{customer}` | OWNER, MGR, STAFF | admin |
| GET | `/customers/segments` | List segments | – → `{segments[]}` | OWNER, MGR | admin |
| POST | `/customers/segments` | Create rule-based segment | `{name, rules[]}` → `201 {segment}` | OWNER, MGR | admin |
| POST | `/customers/:id/gdpr/export` | DSAR data export (async) | – → `202 {job}` | OWNER, MGR | admin |
| POST | `/customers/:id/gdpr/erase` | DSAR right-to-erasure (async, audited) | `{confirm}` → `202 {job}` | OWNER | admin |
| GET | `/portal/orders` | My orders (customer) | `?sort` → `[paged]` | CUST | web |
| GET | `/portal/orders/:id` | My order detail | – → `{order}` | CUST(own) | web |
| GET | `/portal/orders/:id/invoice` | Download invoice PDF | – → `{pdfUrl}` | CUST(own) | web |
| POST | `/portal/orders/:id/return` | Request return | `{items[], reason}` → `201 {return}` | CUST(own) | web |
| GET | `/portal/addresses` | My saved addresses | – → `{addresses[]}` | CUST | web |
| POST | `/portal/addresses` | Add address | `{address}` → `201 {address}` | CUST | web |
| GET | `/portal/profile` | My profile | – → `{customer}` | CUST | web |
| PATCH | `/portal/profile` | Update profile | `{...}` → `{customer}` | CUST | web |
| POST | `/portal/gdpr/export` | Self-service data export | – → `202 {job}` | CUST | web |
| POST | `/portal/gdpr/erase` | Self-service erasure request | `{confirm}` → `202 {job}` | CUST | web |

---

# MODULE: storefront — Storefront (customer web) (P1)

**Base:** `/storefront/*` (public, tenant resolved by host)
**Consumers:** web. Powers the live customer-facing store (SSR + client).

| Method | Path | Purpose | Request → Response | Roles | Consumers |
|---|---|---|---|---|---|
| GET | `/storefront/config` | Theme, branding, nav, locale, currency | – → `{theme, nav, branding, locales}` | Public | web |
| GET | `/storefront/products` | Browse published products | `?category,collection,q,filters,sort` → `[paged]` | Public | web |
| GET | `/storefront/products/:slug` | Product detail page data | – → `{product, variants[], media[], seo, related[]}` | Public | web |
| GET | `/storefront/categories/:slug` | Category page | – → `{category, products[paged]}` | Public | web |
| GET | `/storefront/collections/:slug` | Collection page | – → `{collection, products[paged]}` | Public | web |
| GET | `/storefront/pages/:slug` | CMS/landing page content | – → `{page}` | Public | web |
| GET | `/storefront/navigation` | Menus/footers | – → `{menus[]}` | Public | web |
| GET | `/storefront/sitemap.xml` | Sitemap | – → xml | Public | web, ext |
| GET | `/storefront/robots.txt` | Robots | – → text | Public | web, ext |
| GET | `/storefront/search` | Search (server-side convenience) | `?q,filters` → `[paged]` | Public | web |
| GET | `/storefront/recommendations` | Related/recommended products | `?productId` → `{products[]}` | Public | web |

---

# MODULE: admin — Admin Dashboard (P1)

**Base:** `/dashboard`
**Consumers:** admin. Aggregation endpoints powering the owner dashboard (revenue/orders/customers/inventory/AI insights).

| Method | Path | Purpose | Request → Response | Roles | Consumers |
|---|---|---|---|---|---|
| GET | `/dashboard/overview` | KPI summary (revenue/orders/AOV/conversion) | `?period` → `{kpis}` | OWNER, MGR, STAFF | admin |
| GET | `/dashboard/revenue` | Revenue daily/weekly/monthly/yearly | `?granularity,from,to` → `{series[]}` | OWNER, MGR | admin |
| GET | `/dashboard/orders-trend` | Order status + trends | `?period` → `{series[], byStatus}` | OWNER, MGR, STAFF | admin |
| GET | `/dashboard/customers-trend` | New vs returning | `?period` → `{series[]}` | OWNER, MGR | admin |
| GET | `/dashboard/inventory-alerts` | Stock alerts widget | – → `{alerts[]}` | OWNER, MGR, STAFF | admin |
| GET | `/dashboard/top-products` | Best sellers | `?period,limit` → `{products[]}` | OWNER, MGR | admin |
| GET | `/dashboard/ai-insights` | AI opportunities/recommendations | – → `{insights[]}` | OWNER, MGR | admin |
| GET | `/dashboard/activity` | Recent activity feed | `?limit` → `[paged]` | OWNER, MGR, STAFF | admin |

---

# MODULE: search — Search (Meilisearch) (P1)

**Base:** `/search`
**Consumers:** web (token → direct Meili), admin, worker (indexing). Master key never exposed.

| Method | Path | Purpose | Request → Response | Roles | Consumers |
|---|---|---|---|---|---|
| POST | `/search/token` | Mint scoped tenant token (1h, filter tenant_id) | `{indexes[]}` → `{token, host, indexes, expiresAt}` | Public; CUST; Any auth | web, admin |
| GET | `/search/products` | Server-side product search | `?q,filters,sort,limit` → `[paged]` | Public; Any auth | admin, web |
| GET | `/search/customers` | Search customers (admin) | `?q` → `[paged]` | OWNER, MGR, STAFF | admin |
| GET | `/search/orders` | Search orders (admin) | `?q` → `[paged]` | OWNER, MGR, STAFF | admin |
| POST | `/search/reindex` | Trigger full reindex (async) | `{index}` → `202 {job}` | OWNER, MGR | admin |
| GET | `/search/suggestions` | Autocomplete/typeahead | `?q` → `{suggestions[]}` | Public | web |

---

# MODULE: media — Media & Storage (P1)

**Base:** `/media`
**Consumers:** admin (uploads), web (delivery), worker (extraction frames, generated images). S3-compatible (MinIO/R2) with presigned URLs.

| Method | Path | Purpose | Request → Response | Roles | Consumers |
|---|---|---|---|---|---|
| POST | `/media/uploads` | Request presigned upload URL | `{filename, contentType, size, kind}` → `{uploadUrl, mediaId, fields}` | OWNER, MGR, STAFF | admin |
| POST | `/media/uploads/multipart` | Init multipart upload (large files/video) | `{filename, contentType, size}` → `{uploadId, partUrls[]}` | OWNER, MGR, STAFF | admin |
| POST | `/media/uploads/multipart/:uploadId/complete` | Complete multipart upload | `{parts[]}` → `{media}` | OWNER, MGR, STAFF | admin |
| POST | `/media/:id/confirm` | Confirm + enqueue processing (thumbs) | – → `{media}` | OWNER, MGR, STAFF | admin |
| GET | `/media` | List media assets | `?kind,q` → `[paged]` | OWNER, MGR, STAFF | admin |
| GET | `/media/:id` | Asset metadata + URLs | – → `{media, variants{}}` | OWNER, MGR, STAFF; Public(published) | admin, web |
| DELETE | `/media/:id` | Delete asset | – → `204` | OWNER, MGR | admin |
| POST | `/media/:id/optimize` | Re-derive sizes/formats | `{formats[]}` → `202 {job}` | OWNER, MGR | admin |

---

# MODULE: notifications — Notifications (email/chat) (P1)

**Base:** `/notifications`, `/templates`
**Consumers:** admin (config/templates), worker (sends), all (in-app). Email via SMTP/SendGrid (Mailhog local).

| Method | Path | Purpose | Request → Response | Roles | Consumers |
|---|---|---|---|---|---|
| GET | `/notifications` | In-app notification inbox | `?unread` → `[paged]` | Any auth | admin |
| POST | `/notifications/:id/read` | Mark read | – → `204` | Any auth | admin |
| POST | `/notifications/read-all` | Mark all read | – → `204` | Any auth | admin |
| GET | `/notifications/preferences` | Channel/event preferences | – → `{preferences}` | Any auth | admin, web |
| PATCH | `/notifications/preferences` | Update preferences | `{...}` → `{preferences}` | Any auth | admin, web |
| GET | `/templates` | List email/notification templates | – → `[paged]` | OWNER, MGR | admin |
| GET | `/templates/:id` | Template detail | – → `{template}` | OWNER, MGR | admin |
| PATCH | `/templates/:id` | Edit template (subject/body) | `{subject?, body?}` → `{template}` | OWNER, MGR | admin |
| POST | `/templates/:id/test` | Send test email | `{to}` → `202` | OWNER, MGR | admin |
| POST | `/notifications/send` | Trigger transactional send (internal/api) | `{template, to, data}` → `202 {job}` | SVC; OWNER | admin, worker |

---

# MODULE: ai-core — AI Provider Abstraction & Agent Orchestration (P2)

**Base:** `/ai`, `/ai/agents`
**Consumers:** admin (config/runs), worker (executes), all AI modules. Provider abstraction over Claude/OpenAI/Gemini; emits `ai.usage` for billing.

| Method | Path | Purpose | Request → Response | Roles | Consumers |
|---|---|---|---|---|---|
| GET | `/ai/providers` | List providers + model availability | – → `{providers[], defaultModel}` | OWNER, MGR | admin |
| GET | `/ai/config` | Tenant AI config (provider routing, fallback) | – → `{config}` | OWNER, MGR | admin |
| PATCH | `/ai/config` | Update routing/model preferences | `{provider?, model?, fallback?}` → `{config}` | OWNER | admin |
| GET | `/ai/agents` | List specialized agents + status | – → `{agents[]}` | OWNER, MGR | admin |
| GET | `/ai/agents/:key` | Agent detail/config (e.g. extraction, seo) | – → `{agent, config}` | OWNER, MGR | admin |
| POST | `/ai/agents/:key/run` | Invoke agent task (AI-credit guarded, async) | `{input, context}` → `202 {run}` | OWNER, MGR | admin |
| GET | `/ai/runs` | List agent runs/history | `?agent,status` → `[paged]` | OWNER, MGR | admin |
| GET | `/ai/runs/:id` | Run detail + output + cost | – → `{run, output, usage}` | OWNER, MGR | admin |
| GET | `/ai/runs/:id/events` | Stream run progress (SSE) | – → SSE | OWNER, MGR | admin |
| GET | `/ai/usage` | AI usage/cost breakdown (per model) | `?from,to` → `{usage[], totalCost}` | OWNER, MGR | admin |

---

# MODULE: ai-extraction — AI Product Extraction Engine [FLAGSHIP] (P2)

**Base:** `/extraction-jobs`, `/catalog-drafts`
**Consumers:** admin (capture/review/publish), worker (pipeline), web (mobile capture). **Human verification gate is mandatory — nothing auto-publishes.**

### Capture & ingest

| Method | Path | Purpose | Request → Response | Roles | Consumers |
|---|---|---|---|---|---|
| POST | `/extraction-jobs/uploads` | Request presigned multipart video upload (10/20-min cap, 1080p min) | `{filename, contentType, size, durationSec}` → `{uploadId, partUrls[], jobDraftId}` | OWNER, MGR | admin, web |
| POST | `/extraction-jobs/uploads/:uploadId/complete` | Complete video upload | `{parts[]}` → `{videoAssetId}` | OWNER, MGR | admin, web |
| POST | `/extraction-jobs` | **Submit extraction job** (Idempotency-Key, AI-credit guarded → 202) | `{videoAssetId, language?, storeType?, options{ocr, barcode, dedup, inventoryEstimate}}` → `202 {job}` | OWNER, MGR | admin, web |
| POST | `/extraction-jobs/photo-batch` | Photo-batch fallback (privacy/no-video path) | `{mediaIds[], options{}}` → `202 {job}` | OWNER, MGR | admin, web |

### Status & monitoring

| Method | Path | Purpose | Request → Response | Roles | Consumers |
|---|---|---|---|---|---|
| GET | `/extraction-jobs` | List extraction jobs | `?status,sort` → `[paged]` | OWNER, MGR, STAFF | admin |
| GET | `/extraction-jobs/:id` | **Job status + progress + stage** | – → `{job, status, progress, stage, counts{detected,deduped,lowConfidence}}` | OWNER, MGR, STAFF | admin, web |
| GET | `/extraction-jobs/:id/events` | **Live job progress (SSE)** | – → SSE `{status, progress, stage, partialCount}` | OWNER, MGR, STAFF | admin, web |
| POST | `/extraction-jobs/:id/cancel` | Cancel running job | – → `{job}` | OWNER, MGR | admin |
| GET | `/extraction-jobs/:id/frames` | Source frames/crops (debug/evidence) | `?productDraftId` → `[paged]` | OWNER, MGR | admin |

### Review (human verification layer)

| Method | Path | Purpose | Request → Response | Roles | Consumers |
|---|---|---|---|---|---|
| GET | `/catalog-drafts/:jobId` | **Draft catalog for review** (products + per-field confidence) | `?confidenceLt,needsPrice` → `{draft, products[], summary{autoFilled%, needsReview}}` | OWNER, MGR, STAFF | admin, web |
| GET | `/catalog-drafts/:jobId/products/:draftProductId` | Single draft product (fields + confidence + frames) | – → `{draftProduct, confidence{}, frames[]}` | OWNER, MGR, STAFF | admin |
| PATCH | `/catalog-drafts/:jobId/products/:draftProductId` | **Correct a draft product** (price/name/category/qty) | `{name?, price?, categoryId?, quantity?, variants?}` → `{draftProduct}` | OWNER, MGR, STAFF | admin, web |
| DELETE | `/catalog-drafts/:jobId/products/:draftProductId` | Reject/remove a draft product | – → `204` | OWNER, MGR, STAFF | admin, web |
| POST | `/catalog-drafts/:jobId/products/:draftProductId/merge` | Merge duplicate drafts | `{intoDraftProductId}` → `{draftProduct}` | OWNER, MGR, STAFF | admin |
| POST | `/catalog-drafts/:jobId/products/:draftProductId/split` | Split into variants/separate products | `{splits[]}` → `{draftProducts[]}` | OWNER, MGR, STAFF | admin |
| GET | `/catalog-drafts/:jobId/unresolved` | Items needing manual input (missing price etc.) | – → `{products[]}` | OWNER, MGR, STAFF | admin, web |

### Approve & publish (the human gate → live store)

| Method | Path | Purpose | Request → Response | Roles | Consumers |
|---|---|---|---|---|---|
| POST | `/catalog-drafts/:jobId/approve` | **Approve reviewed draft** (explicit human action, audited) | `{approveAll?, draftProductIds?}` → `{draft, status:"APPROVED"}` | OWNER, MGR | admin, web |
| POST | `/catalog-drafts/:jobId/publish` | **Publish approved draft → live catalog** (Idempotency-Key, async, never auto) | `{}` → `202 {job}` | OWNER, MGR | admin, web |
| GET | `/catalog-drafts/:jobId/publish-status` | Publish progress | – → `{status, publishedCount, total}` | OWNER, MGR, STAFF | admin, web |

---

# MODULE: content — AI Content Generation (descriptions/SEO/pages) (P2)

**Base:** `/content`, `/seo`
**Consumers:** admin, worker. SEO Agent + Content Agent. AI-credit guarded; output sanitized (DOMPurify); human review before publish.

| Method | Path | Purpose | Request → Response | Roles | Consumers |
|---|---|---|---|---|---|
| POST | `/content/descriptions` | Generate product description(s) (async) | `{productIds[], tone?, lang?}` → `202 {job}` | OWNER, MGR, STAFF | admin |
| POST | `/content/seo` | Generate meta title/description/keywords/structured data | `{entityType, entityId, lang?}` → `202 {job}` | OWNER, MGR, STAFF | admin |
| POST | `/content/pages` | Generate landing/category/about page | `{type, prompt, lang?}` → `202 {job}` | OWNER, MGR | admin |
| POST | `/content/blog` | Generate blog post | `{topic, keywords?, lang?}` → `202 {job}` | OWNER, MGR | admin |
| POST | `/content/faqs` | Generate FAQs | `{context, lang?}` → `202 {job}` | OWNER, MGR | admin |
| POST | `/content/translate` | Translate product/store content (100+ langs) | `{entityType, entityIds[], targetLangs[]}` → `202 {job}` | OWNER, MGR | admin |
| GET | `/content/drafts` | List generated content drafts (pre-publish) | `?type,status` → `[paged]` | OWNER, MGR, STAFF | admin |
| POST | `/content/drafts/:id/apply` | Apply/publish generated content (human gate) | `{}` → `{result}` | OWNER, MGR | admin |
| POST | `/content/drafts/:id/regenerate` | Regenerate with feedback | `{feedback}` → `202 {job}` | OWNER, MGR, STAFF | admin |
| GET | `/seo/pages` | SEO state per page/product | `?entityType` → `[paged]` | OWNER, MGR | admin |
| PATCH | `/seo/pages/:id` | Manual SEO override | `{metaTitle?, metaDescription?, keywords?}` → `{seo}` | OWNER, MGR | admin |

---

# MODULE: store-builder — AI Store Builder + Website Cloning (P3)

**Base:** `/store-builder`
**Consumers:** admin, worker. Generates a store from a name; "visual inspiration" cloning (never copies assets/HTML).

| Method | Path | Purpose | Request → Response | Roles | Consumers |
|---|---|---|---|---|---|
| POST | `/store-builder/generate` | Build store from name (+optional URL) (async) | `{storeName, industry?, inspirationUrl?, brandHints?}` → `202 {job}` | OWNER | admin |
| GET | `/store-builder/jobs/:id` | Build job status | – → `{job, status, progress, previewUrl?}` | OWNER, MGR | admin |
| GET | `/store-builder/jobs/:id/events` | Build progress (SSE) | – → SSE | OWNER, MGR | admin |
| POST | `/store-builder/clone/analyze` | Analyze a URL (screenshots → design tokens) | `{url}` → `202 {job}` | OWNER | admin |
| GET | `/store-builder/clone/:id` | Extracted design language (palette/type/spacing) | – → `{tokens, palette, typography, layout}` | OWNER, MGR | admin |
| POST | `/store-builder/branding` | Generate logo/branding | `{storeName, style?}` → `202 {job}` | OWNER | admin |
| POST | `/store-builder/policies` | Generate store policies (returns/privacy/shipping) | `{jurisdiction, lang?}` → `202 {job}` | OWNER | admin |
| GET | `/store-builder/preview/:id` | Preview generated store | – → `{previewUrl, sections[]}` | OWNER, MGR | admin |
| POST | `/store-builder/:id/apply` | Apply generated store (human gate, async) | `{sections[]}` → `202 {job}` | OWNER | admin |

---

# MODULE: theme-engine — AI Theme Generation (P3)

**Base:** `/themes`
**Consumers:** admin, web (live theme), worker. Dynamic themes (luxury/modern/fashion/grocery/pharmacy...), no fixed templates.

| Method | Path | Purpose | Request → Response | Roles | Consumers |
|---|---|---|---|---|---|
| GET | `/themes` | List tenant themes | – → `[paged]` | OWNER, MGR | admin |
| GET | `/themes/active` | Active theme + tokens | – → `{theme}`; Public(storefront) | OWNER, MGR; Public | admin, web |
| POST | `/themes/generate` | Generate theme from style/brand (async) | `{style, palette?, fonts?, fromUrl?}` → `202 {job}` | OWNER, MGR | admin |
| GET | `/themes/:id` | Theme detail (tokens/sections) | – → `{theme, tokens, sections}` | OWNER, MGR | admin |
| PATCH | `/themes/:id` | Edit theme tokens/layout | `{tokens?, sections?}` → `{theme}` | OWNER, MGR | admin |
| POST | `/themes/:id/preview` | Preview without applying | – → `{previewUrl}` | OWNER, MGR | admin |
| POST | `/themes/:id/activate` | Set active theme (human gate) | `{}` → `{theme}` | OWNER, MGR | admin |
| POST | `/themes/:id/duplicate` | Clone theme to edit | – → `201 {theme}` | OWNER, MGR | admin |

---

# MODULE: google — Google Ecosystem Integration (P4)

**Base:** `/integrations/google`
**Consumers:** admin, worker. Per-tenant OAuth (partial-grant aware), Merchant API v1, GBP, GA4, GSC, GTM, Maps. Stores encrypted tokens per tenant.

| Method | Path | Purpose | Request → Response | Roles | Consumers |
|---|---|---|---|---|---|
| GET | `/integrations/google/status` | Connection + granted scopes per service | – → `{connected, grantedScopes[], services{}}` | OWNER, MGR | admin |
| GET | `/integrations/google/connect` | Begin OAuth (request scopes) | `?scopes[],redirect` → `302` | OWNER | admin |
| GET | `/integrations/google/callback` | OAuth callback (store granted scopes) | `?code,state` → `302` | OWNER | admin |
| POST | `/integrations/google/disconnect` | Revoke connection | `{service?}` → `204` | OWNER | admin |
| POST | `/integrations/google/business-profile/sync` | Sync GBP (name/address/hours/photos) (async) | `{locationId?}` → `202 {job}` | OWNER, MGR | admin |
| GET | `/integrations/google/business-profile` | GBP linked locations | – → `{locations[]}` | OWNER, MGR | admin |
| POST | `/integrations/google/merchant/sync` | Sync products → Merchant Center (Merchant API v1, async) | `{productIds?}` → `202 {job}` | OWNER, MGR | admin |
| GET | `/integrations/google/merchant/status` | Feed/product approval status | – → `{account, productStatus[]}` | OWNER, MGR | admin |
| POST | `/integrations/google/analytics/provision` | Auto-create GA4 property + stream | – → `202 {job}` | OWNER | admin |
| GET | `/integrations/google/analytics` | GA4 config (measurementId, propertyId) | – → `{ga4}` | OWNER, MGR | admin |
| POST | `/integrations/google/search-console/verify` | Auto-verify + submit sitemap | – → `202 {job}` | OWNER | admin |
| POST | `/integrations/google/search-console/index` | Request indexing for new URLs | `{urls[]}` → `202 {job}` | OWNER, MGR | admin |
| POST | `/integrations/google/tag-manager/setup` | One-click GTM container + tags (GA4/ads) | – → `202 {job}` | OWNER | admin |
| GET | `/integrations/google/maps/embed-config` | Maps embed config (location) | – → `{config}`; Public(storefront) | OWNER, MGR; Public | admin, web |
| POST | `/webhooks/google` | Inbound Pub/Sub (Merchant/GBP notifications) | event → `200` | SVC | ext |

---

# MODULE: marketing — AI Marketing Agent (P4)

**Base:** `/marketing`
**Consumers:** admin, worker. Generates ad creatives/copy for Meta/TikTok/Pinterest/Google Ads. **Human approval required** before launch.

| Method | Path | Purpose | Request → Response | Roles | Consumers |
|---|---|---|---|---|---|
| GET | `/marketing/campaigns` | List campaigns | `?status,channel` → `[paged]` | OWNER, MGR | admin |
| POST | `/marketing/campaigns` | Create campaign | `{name, channel, objective, budget}` → `201 {campaign}` | OWNER, MGR | admin |
| GET | `/marketing/campaigns/:id` | Campaign detail + performance | – → `{campaign, metrics}` | OWNER, MGR | admin |
| POST | `/marketing/generate/ads` | Generate ad creatives + copy (async) | `{channel, productIds[], tone?}` → `202 {job}` | OWNER, MGR | admin |
| POST | `/marketing/generate/images` | Generate ad imagery (AI-credit guarded) | `{prompt, count, size}` → `202 {job}` | OWNER, MGR | admin |
| GET | `/marketing/creatives` | List generated creatives (draft) | `?campaignId,status` → `[paged]` | OWNER, MGR | admin |
| POST | `/marketing/creatives/:id/approve` | **Approve creative (human gate)** | `{}` → `{creative}` | OWNER, MGR | admin |
| POST | `/marketing/campaigns/:id/launch` | Launch to channel (human gate, async) | `{}` → `202 {job}` | OWNER | admin |
| POST | `/marketing/campaigns/:id/pause` | Pause campaign | – → `{campaign}` | OWNER, MGR | admin |
| GET | `/marketing/email-campaigns` | List email campaigns | – → `[paged]` | OWNER, MGR | admin |
| POST | `/marketing/email-campaigns` | Create + generate email campaign | `{name, segmentId, prompt}` → `202 {job}` | OWNER, MGR | admin |

---

# MODULE: customer-service — AI Customer Service Agent (P4)

**Base:** `/cs`, `/chat`
**Consumers:** admin (inbox/config), web (chat widget). Trains on products/policies/inventory/shipping; can answer, track orders, create tickets.

| Method | Path | Purpose | Request → Response | Roles | Consumers |
|---|---|---|---|---|---|
| POST | `/chat/sessions` | Start storefront chat session | `{customerId?, context?}` → `{sessionId}` | Public; CUST | web |
| POST | `/chat/sessions/:id/messages` | Send message → AI reply (streamed) | `{message}` → `{reply}` / SSE | Public; CUST | web |
| GET | `/chat/sessions/:id/events` | Stream assistant reply (SSE) | – → SSE | Public; CUST | web |
| GET | `/cs/conversations` | Agent inbox (all channels) | `?status,channel` → `[paged]` | OWNER, MGR, STAFF | admin |
| GET | `/cs/conversations/:id` | Conversation detail | – → `{conversation, messages[]}` | OWNER, MGR, STAFF | admin |
| POST | `/cs/conversations/:id/reply` | Human/agent reply | `{message}` → `{message}` | OWNER, MGR, STAFF | admin |
| POST | `/cs/conversations/:id/handoff` | Escalate AI → human | – → `{conversation}` | OWNER, MGR, STAFF | admin |
| GET | `/cs/tickets` | List support tickets | `?status` → `[paged]` | OWNER, MGR, STAFF | admin |
| POST | `/cs/tickets` | Create ticket | `{subject, body, customerId?}` → `201 {ticket}` | OWNER, MGR, STAFF; CUST | admin, web |
| POST | `/cs/knowledge/retrain` | Retrain agent on catalog/policies (async) | `{sources[]}` → `202 {job}` | OWNER, MGR | admin |
| GET | `/cs/knowledge` | Knowledge base sources/status | – → `{sources[]}` | OWNER, MGR | admin |

---

# MODULE: pricing — AI Pricing Agent (P4)

**Base:** `/pricing`
**Consumers:** admin, worker. Recommends discounts/promotions/dynamic pricing/bundles. Recommendations only — applying is a human action.

| Method | Path | Purpose | Request → Response | Roles | Consumers |
|---|---|---|---|---|---|
| GET | `/pricing/recommendations` | List AI pricing recommendations | `?productId,type` → `[paged]` | OWNER, MGR | admin |
| POST | `/pricing/analyze` | Run pricing analysis (competitors/demand/margin) (async) | `{productIds[], goals{}}` → `202 {job}` | OWNER, MGR | admin |
| GET | `/pricing/recommendations/:id` | Recommendation detail + rationale | – → `{recommendation, rationale, projectedImpact}` | OWNER, MGR | admin |
| POST | `/pricing/recommendations/:id/apply` | Apply recommendation (human gate) | `{}` → `{result}` | OWNER, MGR | admin |
| POST | `/pricing/recommendations/:id/dismiss` | Dismiss recommendation | `{reason?}` → `204` | OWNER, MGR | admin |
| GET | `/pricing/rules` | List dynamic pricing rules | – → `[paged]` | OWNER, MGR | admin |
| POST | `/pricing/rules` | Create pricing rule | `{name, conditions[], action}` → `201 {rule}` | OWNER, MGR | admin |
| POST | `/pricing/bundles` | Suggest/create bundle offers | `{productIds[]}` → `202 {job}` | OWNER, MGR | admin |

---

# MODULE: analytics — Analytics & Business Intelligence (P4)

**Base:** `/analytics`
**Consumers:** admin, worker. BI metrics + AI inventory forecasting + Analytics Agent. GA4 server events via Measurement Protocol (server-side).

| Method | Path | Purpose | Request → Response | Roles | Consumers |
|---|---|---|---|---|---|
| GET | `/analytics/sales` | Sales metrics/time series | `?from,to,granularity,dimensions` → `{series[]}` | OWNER, MGR | admin |
| GET | `/analytics/products` | Product performance | `?from,to,sort` → `[paged]` | OWNER, MGR | admin |
| GET | `/analytics/customers` | Cohorts/LTV/retention | `?from,to` → `{cohorts[]}` | OWNER, MGR | admin |
| GET | `/analytics/funnel` | Conversion funnel | `?from,to` → `{stages[]}` | OWNER, MGR | admin |
| GET | `/analytics/traffic` | Traffic/sources (GA4-backed) | `?from,to` → `{sources[]}` | OWNER, MGR | admin |
| POST | `/analytics/forecast` | AI inventory/demand forecast (async) | `{productIds[], horizonDays}` → `202 {job}` | OWNER, MGR | admin |
| GET | `/analytics/forecast/:id` | Forecast result | – → `{forecast, reorderSuggestions[]}` | OWNER, MGR | admin |
| POST | `/analytics/reports` | Build custom report | `{metrics[], dimensions[], filters}` → `202 {job}` | OWNER, MGR | admin |
| GET | `/analytics/reports/:id` | Report result / export | `?format` → `{report}` | OWNER, MGR | admin |
| POST | `/analytics/events` | Ingest storefront event (→ GA4 MP server-side) | `{eventName, params, clientId}` → `202` | Public; SVC | web, worker |
| POST | `/analytics/insights` | Generate AI BI insights (async) | `{period}` → `202 {job}` | OWNER, MGR | admin |

---

# MODULE: automation — Automation Engine (P5)

**Base:** `/automations`
**Consumers:** admin, worker. Event→condition→action workflows across modules (the Automation Engine).

| Method | Path | Purpose | Request → Response | Roles | Consumers |
|---|---|---|---|---|---|
| GET | `/automations` | List automation workflows | `?enabled` → `[paged]` | OWNER, MGR | admin |
| POST | `/automations` | Create workflow (trigger/conditions/actions) | `{name, trigger, conditions[], actions[]}` → `201 {automation}` | OWNER, MGR | admin |
| GET | `/automations/:id` | Workflow detail | – → `{automation}` | OWNER, MGR | admin |
| PATCH | `/automations/:id` | Edit workflow | `{...}` → `{automation}` | OWNER, MGR | admin |
| POST | `/automations/:id/enable` | Enable/disable | `{enabled}` → `{automation}` | OWNER, MGR | admin |
| DELETE | `/automations/:id` | Delete workflow | – → `204` | OWNER, MGR | admin |
| POST | `/automations/:id/test` | Dry-run against sample | `{sample}` → `{result}` | OWNER, MGR | admin |
| GET | `/automations/:id/runs` | Execution history | `?status` → `[paged]` | OWNER, MGR | admin |
| GET | `/automations/triggers` | Available trigger catalog | – → `{triggers[]}` | OWNER, MGR | admin |
| GET | `/automations/actions` | Available action catalog | – → `{actions[]}` | OWNER, MGR | admin |

---

# Outbound webhooks (tenant-facing, cross-cutting) (P1+)

**Base:** `/webhooks` (management). Delivery format/signing per api-design §10.

| Method | Path | Purpose | Request → Response | Roles | Consumers |
|---|---|---|---|---|---|
| GET | `/webhooks` | List webhook subscriptions | – → `[offset]` | OWNER, MGR | admin, ext |
| POST | `/webhooks` | Register webhook (returns signing secret once) | `{url, events[], description?}` → `201 {webhook, signingSecret}` | OWNER | admin, ext |
| PATCH | `/webhooks/:id` | Update url/events/enabled | `{...}` → `{webhook}` | OWNER | admin, ext |
| DELETE | `/webhooks/:id` | Delete subscription | – → `204` | OWNER | admin, ext |
| GET | `/webhooks/:id/deliveries` | Delivery log/attempts | `?status` → `[paged]` | OWNER, MGR | admin, ext |
| POST | `/webhooks/:id/deliveries/:deliveryId/redeliver` | Retry a delivery | – → `202` | OWNER, MGR | admin, ext |
| GET | `/webhooks/events` | Event type catalog | – → `{events[]}` | OWNER, MGR | admin, ext |

---

## Endpoint count summary

| Module | Phase | Endpoints |
|---|---|---|
| Cross-cutting / meta | P0 | 6 |
| iam | P0 | 31 |
| billing | P0 | 13 |
| catalog | P1 | 22 |
| inventory | P1 | 10 |
| orders | P1 | 15 |
| payments | P1 | 18 |
| shipping | P1 | 11 |
| customers | P1 | 18 |
| storefront | P1 | 11 |
| admin (dashboard) | P1 | 8 |
| search | P1 | 6 |
| media | P1 | 8 |
| notifications | P1 | 10 |
| ai-core | P2 | 10 |
| ai-extraction (flagship) | P2 | 19 |
| content | P2 | 11 |
| store-builder | P3 | 9 |
| theme-engine | P3 | 8 |
| google | P4 | 15 |
| marketing | P4 | 11 |
| customer-service | P4 | 11 |
| pricing | P4 | 8 |
| analytics | P4 | 11 |
| automation | P5 | 10 |
| webhooks (outbound mgmt) | P1+ | 7 |
| **TOTAL** | — | **317** |

> Total: **317 endpoints** across 26 module groups (24 spec modules + cross-cutting/meta + outbound-webhook management). Approximate target ~320; minor drift expected as schemas firm up in implementation. Phase ordering follows the spec (P0→P5); the flagship **ai-extraction** capture→review→approve→publish flow is the critical path and is fully enumerated above with the human-verification gate enforced at the authorization layer.
