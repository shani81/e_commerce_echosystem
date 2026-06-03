# @aicos/api

AICOS backend — **NestJS 11**. Delivers Phase 0 milestones **M0.3** (auth + RBAC +
tenant context) and **M0.4** (billing skeleton).

## What's inside

- **Auth** (`/api/v1/auth`) — argon2 passwords, HS256 access (15m) + refresh (30d)
  JWTs with rotating refresh sessions. Signup provisions a Tenant + owner User +
  built-in Roles + owner Membership atomically.
- **RBAC** — global `JwtAuthGuard` + `RolesGuard`. Routes opt out with `@Public()`
  and declare grants with `@Permissions('resource:action')`. The seeded
  `STORE_OWNER` role holds the `*` wildcard.
- **Multi-tenancy** — `TenantMiddleware` populates an `AsyncLocalStorage` tenant
  context from the verified access token (or `X-Tenant-Id` for service calls).
  **DB tenant isolation is enforced only by `PrismaService.forTenant(tenantId, fn)`**
  (sets the `app.current_tenant` GUC that PostgreSQL RLS reads). Cross-tenant /
  platform work uses `PrismaService.asSystem(fn)`.
- **Billing** (`/api/v1/billing`) — public plans catalogue, tenant subscription,
  and a Stripe webhook receiver that enqueues a BullMQ `billing` job. The queue
  **processor lives in the worker app**, not here.
- **Health** (`/api/v1/health`) — Terminus liveness + readiness (Postgres
  `SELECT 1` via `asSystem`, Redis `PING`).

All routes are under the global prefix **`/api/v1`**.

## Prerequisites

- Node >= 20, pnpm >= 9 (monorepo root).
- PostgreSQL 16+ and Redis running (see root `pnpm infra:up`).
- The DB layer generated: `pnpm db:generate` (and `pnpm db:push && pnpm db:rls`
  for a fresh database). Plans/subscriptions are read from tables seeded by
  `@aicos/db` (`pnpm db:seed`).

## Configuration

Copy `.env.example` to `.env` and fill in real values. Env is validated by zod at
boot (`src/config/configuration.ts`) — an invalid/missing var aborts startup with
a readable message. Required: `DATABASE_URL`, `REDIS_URL`, `JWT_ACCESS_SECRET`,
`JWT_REFRESH_SECRET`. Default port: **4000**.

## Run

```bash
pnpm --filter @aicos/api dev          # watch mode (nest start --watch)
pnpm --filter @aicos/api build        # nest build -> dist/
pnpm --filter @aicos/api start:prod   # node dist/main.js
pnpm --filter @aicos/api typecheck    # tsc --noEmit
pnpm --filter @aicos/api test         # jest (@swc/jest transform)
```

## Endpoints

| Method | Path                         | Auth            | Notes                                   |
| ------ | ---------------------------- | --------------- | --------------------------------------- |
| POST   | `/api/v1/auth/signup`        | public          | Creates tenant + owner, returns tokens  |
| POST   | `/api/v1/auth/login`         | public          | argon2 verify → token pair              |
| POST   | `/api/v1/auth/refresh`       | public          | Rotates the refresh token               |
| POST   | `/api/v1/auth/logout`        | public          | Revokes the refresh session             |
| GET    | `/api/v1/auth/me`            | bearer          | Current principal                       |
| GET    | `/api/v1/users/me`           | bearer          | Own membership in active tenant         |
| GET    | `/api/v1/users`              | `user:read`     | Team members (paginated, `forTenant`)   |
| GET    | `/api/v1/roles`              | `role:read`     | Tenant roles                            |
| GET    | `/api/v1/billing/plans`      | public          | Global SaaS plans                       |
| GET    | `/api/v1/billing/subscription` | `billing:read` | Active tenant subscription            |
| POST   | `/api/v1/webhooks/stripe`    | signature       | Raw body; enqueues a BullMQ job         |
| GET    | `/api/v1/health`             | public          | Liveness                                |
| GET    | `/api/v1/health/ready`       | public          | Readiness (DB + Redis)                  |

### Auth quickstart

```bash
# 1) Sign up (creates a tenant + owner)
curl -sX POST localhost:4000/api/v1/auth/signup \
  -H 'content-type: application/json' \
  -d '{"email":"owner@acme.test","password":"supersecret123","fullName":"Ada Owner","tenantName":"Acme"}'

# 2) Call a protected route with the returned accessToken
curl -s localhost:4000/api/v1/auth/me -H "authorization: Bearer <accessToken>"
```

## Notes

- **Stripe raw body**: `main.ts` boots with `rawBody: true`, so platform-express
  captures the unparsed body as `req.rawBody`. Only `StripeWebhookController`
  reads it, so HMAC verification can run against the exact bytes Stripe signed.
  Signature verification is a documented placeholder until the Stripe SDK lands;
  the controller already enqueues to the `billing` queue.
- **Never import `@prisma/client` directly** — the Prisma client, types and
  tenant helpers come from `@aicos/db`.
