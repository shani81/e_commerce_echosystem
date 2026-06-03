# AICOS — API Design & Conventions

> **Status:** Planned (Phase 0 — planning). 0% built. This is the authoritative API contract design for **AI Commerce OS (AICOS)**.
> **Last updated:** 2026-06-03
> **Owner:** API Architect (API-first)
> **Companion doc:** [`api-registry.md`](../apis/api-registry.md) — the per-module endpoint catalog.

This document defines the **cross-cutting conventions** every AICOS endpoint must obey. The per-module endpoint list lives in `.ai/apis/api-registry.md`. The two documents are normative together: anything the registry omits about format, auth, errors, paging, idempotency, or webhooks is governed here.

---

## 0. API-first principles

1. **Contract before code.** Every endpoint is specified here + in the registry, expressed as an OpenAPI 3.1 document, and frozen before implementation. The OpenAPI spec is the single source of truth; TypeScript types in `packages/types` are generated from it.
2. **One backend, three audiences.** `apps/api` (NestJS) serves three consumer surfaces — `apps/admin` (store owner/manager/staff), `apps/web` (storefront/end customer), and `apps/worker` (internal BullMQ jobs). The **same** REST surface is used by all; audience is distinguished by the auth principal + scopes, not by separate APIs.
3. **Tenant isolation is non-negotiable.** Every business resource is scoped by `tenant_id` and protected by PostgreSQL Row-Level Security. The API layer is a defense-in-depth layer *on top of* RLS, never a substitute for it.
4. **Nothing AI-generated auto-publishes.** Any endpoint that materializes AI output into the live store (`publish`, `approve`) requires an explicit authenticated human action and is logged to the audit trail. There is **no** API path that publishes extraction output without a human `POST .../approve` + `POST .../publish`.
5. **Stable, versioned, predictable.** Breaking changes ship under a new version prefix. Additive changes (new optional fields, new endpoints) never bump the version.

---

## 1. Base URL, versioning & environments

### 1.1 Version prefix

All endpoints are mounted under a major-version prefix:

```
/api/v1/...
```

- **Versioning strategy:** URI-path versioning (`/api/v1`, future `/api/v2`). Chosen over header-based versioning for cache-friendliness, log readability, and zero-ambiguity routing — the non-technical-owner support story benefits from URLs you can paste into a ticket.
- **NestJS implementation:** `app.setGlobalPrefix('api')` + `app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' })`. Controllers declare `@Version('1')`.
- **Major version** bumps only for backwards-incompatible changes (removed field, changed type, changed semantics, removed endpoint).
- **Minor/patch** changes are additive-only and announced via the changelog header `AICOS-API-Version: 1.4.0` returned on every response.
- **Deprecation:** a deprecated endpoint returns `Deprecation: true` and `Sunset: <RFC1123 date>` headers for **≥ 90 days** before removal. The OpenAPI marks it `deprecated: true`.

### 1.2 Host layout

| Surface | Base URL (prod pattern) | Local dev | Notes |
|---|---|---|---|
| API (REST) | `https://api.aicos.app/api/v1` | `http://localhost:4000/api/v1` | NestJS `apps/api`, port **4000** |
| Storefront API (per-tenant) | `https://{store}.aicos.app/api/v1` and custom domains | `http://localhost:3000` proxies to `:4000` | Same backend; tenant resolved from host (see §3.3) |
| Admin app | `https://admin.aicos.app` | `http://localhost:3100` | Consumes the API; not a separate API |
| Worker / queue dashboard | internal only | `http://localhost:4100` | BullMQ board; **not** publicly routed |
| Search (direct) | Meilisearch host | `http://localhost:7700` | Frontend hits Meilisearch **directly** with short-lived tenant tokens (see §11) |

Ports are locked in `.ai/config/project-ports.json`. Do not assume defaults.

### 1.3 Content type & encoding

- Request/response bodies are **`application/json; charset=utf-8`** unless explicitly noted (file upload = `multipart/form-data` only for the small-file fallback; large video upload uses presigned multipart PUT directly to object storage — see Extraction module).
- All timestamps are **ISO 8601 / RFC 3339 UTC** with `Z` suffix (e.g. `2026-06-03T09:41:00.000Z`). Field names use the `At` suffix (`createdAt`, `publishedAt`).
- All monetary amounts are integer **minor units** (cents/øre) in an `amount` field paired with an ISO-4217 `currency` field. We never send floats for money. (Aligns with Stripe; Google Merchant `amountMicros` conversion is handled server-side in the Google module.)
- JSON keys are **`camelCase`**. Enum values are **`SCREAMING_SNAKE_CASE`** strings (never integers), e.g. `status: "AWAITING_REVIEW"`.
- IDs are **prefixed, sortable, opaque strings** — KSUID/ULID-style with a type prefix: `prod_2x9f...`, `ord_...`, `job_...`, `ten_...`, `usr_...`. Clients must treat IDs as opaque.

---

## 2. Resource & URL conventions

- Resources are **plural nouns**: `/products`, `/orders`, `/customers`.
- Sub-resources nest one level where ownership is intrinsic: `/orders/{orderId}/refunds`, `/products/{productId}/variants`.
- **Actions that are not CRUD** are modeled as sub-resource `POST` verbs with an imperative segment, prefixed to avoid colliding with IDs: `POST /extraction-jobs/{jobId}/approve`, `POST /orders/{orderId}/fulfill`, `POST /catalog-drafts/{draftId}/publish`. We use the imperative segment style (not RPC-style `?action=`) so the OpenAPI and RBAC map cleanly.
- HTTP methods:
  - `GET` — read, safe, cacheable, never mutates.
  - `POST` — create, or non-idempotent action.
  - `PUT` — full replace of a resource (rare; we prefer PATCH).
  - `PATCH` — partial update (JSON Merge Patch semantics, RFC 7396).
  - `DELETE` — soft-delete by default (sets `deletedAt`); hard delete only via GDPR erasure path.
- **Collection responses are always paginated** (§5). Never return an unbounded array.
- Tenant context is **never** a URL path parameter for owner-facing endpoints — it is derived from the JWT/host (§3). Platform-super-admin endpoints that cross tenants live under `/api/v1/platform/...` and take `tenantId` explicitly.

---

## 3. Authentication & tenant context

### 3.1 Token model

| Token | Audience | Lifetime | Storage (client) | Transport |
|---|---|---|---|---|
| **Access JWT** | Owner/manager/staff & customer sessions | 15 min | **In-memory only** (never `localStorage`) | `Authorization: Bearer <jwt>` |
| **Refresh token** | Same | 30 days, rotating | **httpOnly, Secure, SameSite=Strict cookie** | Cookie, sent only to `/auth/refresh` |
| **API key** (`sk_live_…` / `sk_test_…`) | Server-to-server / agency / integrations | Until revoked | Server-side secret store | `Authorization: Bearer <key>` |
| **Meilisearch tenant token** | Storefront search (browser → Meili direct) | 1 hour | In-memory | Sent to Meilisearch, not to our API |
| **Webhook signing secret** | Inbound provider webhooks (Stripe/Shippo/Google) | Until rotated | Server-side | HMAC signature header |

- **JWT algorithm:** RS256. Signing keys rotate every **90 days**; the previous public key stays valid during a 15-minute overlap so in-flight tokens validate.
- **Why memory-only access tokens:** XSS (including XSS injected via AI-generated catalog content) must not be able to exfiltrate sessions from `localStorage`. This is a hard rule from the security research.
- **Refresh rotation:** every `/auth/refresh` issues a new refresh token and revokes the old one (reuse detection → full session revoke).

### 3.2 JWT claims

```jsonc
{
  "sub": "usr_2x...",          // user id
  "tid": "ten_8a...",          // tenant id (primary tenant for this session)
  "typ": "user" ,              // "user" | "customer" | "service"
  "roles": ["STORE_OWNER"],    // see RBAC §4
  "scopes": ["catalog:write"], // optional fine-grained scopes for API keys
  "iss": "https://api.aicos.app",
  "aud": "aicos-api",
  "iat": 1780000000,
  "exp": 1780000900,
  "jti": "..."                  // for revocation list
}
```

### 3.3 Tenant resolution order

The `TenantContextMiddleware` resolves the active tenant in this precedence:

1. **`tid` claim** in the access JWT (owner/manager/staff/customer sessions).
2. **Host header** for storefront traffic: `{store}.aicos.app` or a verified custom domain maps to a `tenant_id` via the Domains table (cached in Redis).
3. **`X-Tenant-Id` header** — **only** honored for platform-super-admin and service tokens that carry a cross-tenant scope; rejected (`403`) otherwise.

Once resolved, the middleware:

- sets `AsyncLocalStorage` tenant context for all non-DB code, **and**
- opens the Prisma `$transaction` and runs `SELECT set_config('app.current_tenant', $tenantId, true)` (**transaction-local**, the `true` flag) so PostgreSQL RLS filters every query. With PgBouncer in **transaction pooling** mode this is `SET LOCAL`-equivalent and safe; session-scoped config is forbidden (cross-tenant leak risk).

Requests that reach a tenant-scoped controller without a resolvable tenant get **`401`** (no principal) or **`403 TENANT_CONTEXT_MISSING`**.

### 3.4 Endpoint auth classes

| Class | Marker | Examples |
|---|---|---|
| **Public** | `@Public()` | storefront product browse, health, signup, login, password reset, storefront checkout init |
| **Authenticated (tenant user)** | default | admin dashboard, catalog management |
| **Authenticated (customer)** | `typ=customer` guard | customer portal order history |
| **Platform super admin** | `@Roles('PLATFORM_SUPER_ADMIN')` under `/platform` | tenant suspension, global usage |
| **Service / internal** | service JWT, network-restricted | worker callbacks, webhook fan-in |

---

## 4. Authorization (RBAC) & tenant roles

Roles map to the spec personas. Authorization is enforced by NestJS guards (`RolesGuard`, `ScopesGuard`) layered **on top of** RLS.

| Role | Persona | Scope of power |
|---|---|---|
| `PLATFORM_SUPER_ADMIN` | Platform Super Admin | Cross-tenant; platform ops, billing oversight, tenant lifecycle. Never sees customer PII without break-glass audit log. |
| `AGENCY_ADMIN` | Agency / White-label Reseller | Manages a set of tenants they own/resell; can create tenants, switch context. |
| `STORE_OWNER` | Store Owner (primary persona) | Full control of **one** tenant: catalog, billing, integrations, team, publish. |
| `STORE_MANAGER` | Store Manager | Everything except billing, tenant deletion, and integration secret rotation. |
| `STORE_STAFF` | Store Staff | Operational: orders, fulfillment, customer service, inventory edits. No billing, no publish, no integration config. |
| `CUSTOMER` | End Customer | Storefront + their own portal (their orders, returns, addresses) only. |

**Scope examples** (for API keys / fine-grained delegation): `catalog:read`, `catalog:write`, `orders:read`, `orders:write`, `extraction:run`, `billing:read`, `integrations:write`, `analytics:read`.

**Permission matrix lives per-endpoint in the registry** (the "Roles" column). Default-deny: an endpoint with no listed role is reachable only by `STORE_OWNER` + `PLATFORM_SUPER_ADMIN`.

**Publishing gate:** only `STORE_OWNER` and `STORE_MANAGER` may call any `*/approve` or `*/publish` endpoint. `STORE_STAFF` can edit drafts but cannot publish. This enforces the human-verification decision at the authorization layer.

---

## 5. Pagination, filtering, sorting

### 5.1 Cursor pagination (default for large/append-heavy collections)

Used for `products`, `orders`, `customers`, `extraction-jobs`, `audit-logs`, `notifications`, `media`.

**Request:**
```
GET /api/v1/products?limit=50&cursor=eyJpZCI6InByb2Rf...&sort=createdAt:desc
```
- `limit` — default `25`, max `100`.
- `cursor` — opaque base64 token (encodes last seen sort key + id). Omit for first page.
- `sort` — `field:asc|desc`; allowed fields documented per endpoint. Default `createdAt:desc`.

**Response envelope:**
```jsonc
{
  "data": [ /* items */ ],
  "pageInfo": {
    "hasNextPage": true,
    "endCursor": "eyJpZCI6InByb2Rf...",
    "limit": 50
  }
}
```
Cursor pagination is preferred because RLS-protected tenant tables use a composite `(tenant_id, createdAt)` index — keyset pagination avoids deep-offset full scans.

### 5.2 Offset pagination (small, bounded admin lists only)

For small config-like collections (team members, webhooks, API keys, tax rates) where a page count is useful:
```
GET /api/v1/team?page=1&perPage=20
```
Response adds `pageInfo.totalItems` and `pageInfo.totalPages`.

### 5.3 Filtering & search

- Simple equality filters as query params: `?status=PAID&channel=ONLINE`.
- Ranges: `?createdAtFrom=...&createdAtTo=...`, `?priceMin=...&priceMax=...`.
- Full-text product/customer **search** is delegated to Meilisearch, not SQL `LIKE`. The API exposes `GET /search/*` convenience endpoints, but the storefront hot path queries Meilisearch directly (§11).
- Field selection (sparse fieldsets) via `?fields=id,name,price` where supported, to keep storefront payloads small.

---

## 6. Errors

### 6.1 Format (RFC 9457 Problem Details, extended)

Every non-2xx response uses `Content-Type: application/problem+json`:

```jsonc
{
  "type": "https://docs.aicos.app/errors/validation-failed",
  "title": "Validation failed",
  "status": 422,
  "code": "VALIDATION_FAILED",          // stable machine code (UPPER_SNAKE)
  "detail": "2 fields are invalid.",
  "instance": "/api/v1/products",
  "requestId": "req_2x9f...",            // == X-Request-Id, for support
  "errors": [                            // present for validation errors
    { "field": "price.amount", "code": "MUST_BE_POSITIVE", "message": "Must be > 0" },
    { "field": "sku", "code": "ALREADY_EXISTS", "message": "SKU in use" }
  ]
}
```

- Clients should branch on **`code`** (stable), not `title` (human, may change) or `status` alone.
- `requestId` is echoed in every response header (`X-Request-Id`) and is the key support/tracing identifier.

### 6.2 Status code usage

| Status | When |
|---|---|
| `200` | OK read/update with body |
| `201` | Resource created (returns the resource + `Location` header) |
| `202` | Accepted — async work queued (extraction upload, publish, bulk import). Returns a job/operation resource to poll. |
| `204` | OK, no body (soft delete, ack) |
| `400` | Malformed request (bad JSON, bad enum, bad cursor) |
| `401` | Missing/invalid/expired credentials |
| `403` | Authenticated but not permitted (RBAC, tenant mismatch, scope missing) |
| `404` | Not found **or** exists in another tenant (we return 404 not 403 to avoid leaking existence across tenants) |
| `409` | Conflict (version/ETag mismatch, duplicate SKU, idempotency key reuse with different body) |
| `410` | Gone (sunset endpoint, expired one-time link) |
| `413` | Payload too large (video over limit, body over cap) |
| `415` | Unsupported media type |
| `422` | Semantic validation failure (well-formed but invalid) |
| `429` | Rate limit / quota / AI-credit guard tripped (`Retry-After` set) |
| `5xx` | Server/dependency error — always carries `requestId`; never leaks stack traces |

**Cross-tenant rule:** accessing a resource that exists but belongs to another tenant returns **`404 NOT_FOUND`**, never `403`, so existence is not leaked.

### 6.3 Common error codes (excerpt)

`VALIDATION_FAILED`, `UNAUTHENTICATED`, `TOKEN_EXPIRED`, `FORBIDDEN`, `TENANT_CONTEXT_MISSING`, `NOT_FOUND`, `CONFLICT`, `IDEMPOTENCY_KEY_REUSED`, `RATE_LIMITED`, `AI_CREDITS_EXHAUSTED`, `QUOTA_EXCEEDED`, `PUBLISH_BLOCKED_UNREVIEWED`, `PAYMENT_REQUIRED`, `INTEGRATION_NOT_CONNECTED`, `SCOPE_NOT_GRANTED`, `UPLOAD_TOO_LARGE`, `UNSUPPORTED_MEDIA`, `WEBHOOK_SIGNATURE_INVALID`.

---

## 7. Idempotency

- **All `POST` endpoints that create resources or move money/credits** accept an **`Idempotency-Key`** request header (client-generated UUID v4).
- The server stores `(tenant_id, idempotency_key) → (request fingerprint, response)` in Redis for **24 hours**.
  - Same key + same body → returns the **stored** response (replay-safe).
  - Same key + **different** body → `409 IDEMPOTENCY_KEY_REUSED`.
- **Required** (server rejects with `400` if absent) on: checkout/payment creation, refunds, subscription changes, extraction job submission, catalog publish, bulk import.
- Internally, **BullMQ deduplication** reinforces this: job IDs are deterministic (`tenantId + s3ETag + segmentIndex` for the video pipeline; `tenantId + idempotencyKey` for user-triggered jobs). A duplicate `add()` with an existing jobId is silently ignored.
- **Webhook idempotency:** inbound provider events are deduped by provider event ID (`evt_…`) persisted before processing; replays within the 5-minute signature window are dropped.

---

## 8. Concurrency & optimistic locking

- Mutable resources expose a `version` integer and return a strong **`ETag`** header.
- `PATCH`/`PUT`/`DELETE` may send **`If-Match: "<etag>"`**. On mismatch → `409 CONFLICT` with the current resource in the body. This protects against two staff members editing the same product/order concurrently.

---

## 9. Async operations & job model

The flagship extraction flow and other long jobs (bulk import, Google sync, catalog publish, theme generation) are **asynchronous**. Pattern:

1. Client `POST`s the work → server returns **`202 Accepted`** with an **operation/job resource**:
   ```jsonc
   { "id": "job_2x...", "type": "EXTRACTION", "status": "QUEUED",
     "progress": 0, "createdAt": "...", "links": { "self": "/api/v1/extraction-jobs/job_2x..." } }
   ```
2. Client **polls** `GET /…/{jobId}` (cursor-cheap, cacheable for a few seconds), **and/or**
3. Subscribes to **real-time updates** via Server-Sent Events: `GET /api/v1/extraction-jobs/{jobId}/events` (SSE stream of `status`, `progress`, `stage`, `partialResults`), **and/or**
4. Receives a **tenant webhook** (§10) when the job reaches a terminal/awaiting-review state.

**Job status enum (shared):** `QUEUED → PROCESSING → AWAITING_REVIEW → APPROVED → PUBLISHING → COMPLETED`, plus `FAILED`, `PARTIALLY_COMPLETED`, `CANCELLED`. The extraction pipeline never advances past `AWAITING_REVIEW` without an explicit human `POST .../approve` (architectural human gate).

---

## 10. Webhooks (outbound, to tenants/integrations)

AICOS emits webhooks so tenants/agencies can react to events.

- **Registration:** `POST /api/v1/webhooks` with `url`, `events[]`, optional `description`. Returns a `signingSecret` (shown once).
- **Delivery:** `POST` JSON with headers:
  - `AICOS-Event: order.paid`
  - `AICOS-Delivery: dlv_2x...` (unique per attempt; same `eventId` across retries)
  - `AICOS-Signature: t=<unixSeconds>,v1=<hex HMAC-SHA256>` over `t.payload` using the signing secret.
- **Verification (consumer side):** recompute HMAC; reject if signature mismatch or `|now - t| > 5 min` (replay protection).
- **Retries:** exponential backoff (e.g. 0s, 1m, 5m, 30m, 2h, 6h, 24h) up to ~3 days; non-2xx or timeout (>5s) triggers retry. Delivery log queryable at `GET /api/v1/webhooks/{id}/deliveries`.
- **Event catalog (excerpt):** `extraction.completed`, `extraction.review_ready`, `catalog.published`, `order.created`, `order.paid`, `order.fulfilled`, `order.refunded`, `payment.failed`, `inventory.low_stock`, `customer.created`, `subscription.updated`, `subscription.payment_failed`, `google.sync_completed`.
- **At-least-once** delivery — consumers must dedupe on `eventId`.

**Inbound webhooks** (Stripe, Shippo, Google Pub/Sub, EasyPost) terminate at dedicated routes (`/api/v1/webhooks/stripe`, `/shippo`, `/google`), are **signature-verified**, then enqueued to BullMQ and processed asynchronously (ack `200` within 5s). For Stripe, NestJS bootstraps with `rawBody: true` and **no JSON body parser** is applied to the Stripe route (otherwise HMAC verification silently breaks).

---

## 11. Search access (Meilisearch direct)

- The storefront and admin search boxes query **Meilisearch directly** for latency, using a **scoped tenant token** minted by the API: `POST /api/v1/search/token` → `{ token, host, indexes, expiresAt }` (1-hour TTL, embeds `filter: tenant_id = <tid>`).
- The Meilisearch **master key is never** exposed to any frontend. A leaked token can only ever read that tenant's documents.
- The API also exposes server-side convenience search (`GET /api/v1/search/products?q=…`) for server-rendered pages and for clients that prefer not to talk to Meili directly.
- Note Meilisearch's **10-word query limit**: long queries are truncated; the storefront UI surfaces a hint. Indexing is driven by catalog events via BullMQ.

---

## 12. Rate limiting & AI-cost governance

Three enforcement layers (defense in depth):

1. **Edge / NestJS Throttler (per-IP + per-principal):**
   - Anonymous: 60 req/min per IP.
   - Authenticated user: 600 req/min per user.
   - Auth endpoints (`/auth/login`, `/auth/refresh`, password reset): 10/min per IP (brute-force defense).
2. **Per-tenant API quotas** keyed by subscription tier (Starter/Growth/Pro/Enterprise), tracked in Redis. Exceeding → `429 QUOTA_EXCEEDED`.
3. **AI-credit guard (revenue + abuse protection):** any endpoint that triggers AI spend (extraction submit, content generation, theme generation, marketing/image generation, AI chat) is gated by:
   - a **Redis credit guard** checking the tenant's remaining AI credits / extraction minutes **before** enqueueing (insufficient → `402 PAYMENT_REQUIRED` / `AI_CREDITS_EXHAUSTED`),
   - a **BullMQ queue-level limiter** (`limiter: { max, duration }`) so a single tenant cannot saturate workers,
   - per-provider rate-limit tracking with exponential backoff + automatic fallback (Gemini → Claude) on `429` from upstream.

Rate-limited responses include `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`.

> Rationale (from research): a single compromised account can otherwise burn thousands of dollars of AI API spend in minutes. The credit guard is treated as **billing infrastructure**, not optional rate limiting.

---

## 13. Standard headers

**Request (client → API):**
| Header | Purpose |
|---|---|
| `Authorization: Bearer <token>` | Access JWT or API key |
| `Idempotency-Key: <uuid>` | Idempotent POST (§7) |
| `If-Match: "<etag>"` | Optimistic concurrency (§8) |
| `X-Tenant-Id` | Cross-tenant ops (super-admin/service only) |
| `Accept-Language` | i18n / translated content selection |
| `X-Request-Id` | Optional client-supplied trace id (server generates one if absent) |

**Response (API → client):**
| Header | Purpose |
|---|---|
| `X-Request-Id` | Trace/support correlation (always present) |
| `AICOS-API-Version` | Semantic API version (e.g. `1.4.0`) |
| `ETag` | Resource version for concurrency |
| `RateLimit-*` / `Retry-After` | Throttling state |
| `Deprecation` / `Sunset` | Lifecycle warnings |
| `Cache-Control` | Caching policy (storefront reads get CDN-friendly values) |

---

## 14. Security headers, CORS & PCI

- **CORS:** allow-list per tenant (own storefront origin + custom domains + `admin.aicos.app`). Credentials allowed only for first-party origins. No wildcard with credentials.
- **CSP** on storefront/checkout includes Stripe's required directives **and** a `report-uri` to satisfy **PCI DSS v4.0 Req 11.6.1** tamper detection. Payment pages use Stripe Checkout/Elements → AICOS stays in **SAQ A** scope (no card data touches our servers).
- Standard hardening: `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`.
- **AI-generated HTML/content is sanitized (DOMPurify) server-side before persistence** so the catalog cannot become a stored-XSS vector.

---

## 15. OpenAPI, docs & client generation

- **Single source of truth:** OpenAPI **3.1** document generated from NestJS decorators (`@nestjs/swagger`) and hand-augmented for examples/security schemes.
- **Served at:**
  - `GET /api/v1/openapi.json` — machine-readable spec.
  - `GET /api/v1/docs` — Swagger UI (auth-gated outside dev).
- **Type generation:** `packages/types` regenerates TS request/response types from the spec in CI; drift between spec and code fails the build.
- **Contract tests:** every controller has a contract test asserting responses conform to the schema; provider-side webhook payloads are schema-validated too.
- **Examples mandatory:** every operation carries at least one request + success example and the common error examples.

---

## 16. Health, observability & meta endpoints

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /api/v1/health/live` | public | liveness (process up) |
| `GET /api/v1/health/ready` | public | readiness (DB, Redis, Meili, storage reachable) |
| `GET /api/v1/version` | public | build/version/commit |
| `GET /api/v1/openapi.json` | public (dev) / gated (prod) | spec |
| `GET /api/v1/me` | auth | current principal, tenant, roles, scopes |

- Every request/response is traced (OpenTelemetry); `X-Request-Id` correlates logs ⇄ traces ⇄ webhook deliveries.
- `ai.usage` events (provider/model/tokens/cost) are emitted on every AI call so the billing module can deduct credits — without this, AI cost tracking is impossible.

---

## 17. Conventions quick-reference

| Concern | Decision |
|---|---|
| Version | URI `/api/v1`; additive = no bump; breaking = `/api/v2`; 90-day sunset |
| Auth | RS256 JWT (15 min, in-memory) + rotating refresh cookie (30 d) + API keys |
| Tenant | JWT `tid` / host / (super-admin) `X-Tenant-Id`; RLS via tx-local `set_config(...,true)` |
| IDs | prefixed ULID-style opaque strings |
| Money | integer minor units + ISO-4217 currency |
| Time | RFC 3339 UTC `Z` |
| Casing | camelCase keys, SCREAMING_SNAKE enums |
| Pagination | cursor (default), offset (small admin lists) |
| Errors | RFC 9457 `problem+json` + stable `code` |
| Idempotency | `Idempotency-Key` header, 24h, required on money/credits/publish |
| Concurrency | `version` + `ETag` + `If-Match` |
| Async | 202 + job resource + poll/SSE/webhook; human gate before publish |
| Webhooks | HMAC-SHA256 signed, 5-min replay window, at-least-once, retried |
| Search | Meilisearch direct via 1h tenant token; master key never exposed |
| Rate limit | Throttler + tenant quota + AI-credit guard (402/429) |
| Docs | OpenAPI 3.1, Swagger UI, generated types, contract tests |

---

*Endpoint-by-endpoint detail (paths, methods, request/response shape summaries, roles, consumers) is maintained in [`.ai/apis/api-registry.md`](../apis/api-registry.md).*
