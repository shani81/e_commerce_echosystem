# AICOS — Completed

> Work finished. Append newest at top. We are in **PHASE 1 — Core Commerce**; Phase 0 (foundation) is complete (exit review GO).
> Last updated: 2026-06-03.

## 2026-06-03 — Phase 1 · M1.2 Search & storefront (Meilisearch + public browse)

| ID | Description | Evidence |
|----|-------------|----------|
| C1-007 | **Search (API)** — Meilisearch products index (settings + per-tenant filtering; graceful no-op without a key); indexer syncs on catalog product/variant mutations; `/search/products` (tenant search), `/search/reindex`, `/search/token` (per-tenant scoped token, 1h). | `apps/api/src/search/**` |
| C1-008 | **Public storefront (API)** — store-slug → tenant resolution; PUBLISHED-only browse/search (Meili-backed, DB fallback) + product detail. `/storefront/:slug[/products[/:productSlug]]`. | `apps/api/src/storefront/**` |
| C1-009 | **Web storefront** — `/shop` (search + product grid) + `/products/[slug]` (detail) via a public client; landing links to it. | `apps/web/src/{app/shop,app/products,lib/storefront-api}` |
| C1-010 | **Fix** — RBAC guard treats `*:*` as a full grant (seeded owner role). | `apps/api/src/common/guards/roles.guard.ts` |
| C1-011 | **Verified live** — smoke 13/13: login → create+publish → tenant search (total=1) → reindex → token → storefront browse/detail (product present) → 404 on bogus store. typecheck 14/14, lint 13/13, build 9/9. | smoke |

## 2026-06-03 — Phase 1 · M1.1 Core Commerce (catalog + inventory + media APIs)

| ID | Description | Evidence |
|----|-------------|----------|
| C1-001 | **Catalog** module — products/variants, categories (+tree), brands; publish (DRAFT→ACTIVE); product↔media images. Tenant-scoped (forTenant) + RBAC + per-tenant unique → 409. 20 endpoints. | `apps/api/src/catalog/**` |
| C1-002 | **Inventory** module — locations, inventory items (computed `available`), stock adjustments (StockMovement ledger), low-stock alerts; negative-stock guard. 11 endpoints. | `apps/api/src/inventory/**` |
| C1-003 | **Media** module — presigned S3/MinIO upload → confirm → get(download url) → delete over MediaAsset; `@aws-sdk/*` + S3 config. | `apps/api/src/media/**` |
| C1-004 | Hardening: `?take`/`?skip` no longer 500 (PaginationDto getters `@Exclude`d); Nest tsconfig `declaration:false` (fixes TS2742 on Prisma return types); web/admin lint → shared flat config; `ui` empty-interface fixed; RBAC perms for catalog/inventory/media. | various |
| C1-005 | **Verified live**: typecheck 14/14, lint 13/13, build 9/9, and a smoke test (signup → brand/category/product/variant → publish → list → location/inventory → adjust 100→95 → alerts → media presign → 401) **17/17 PASS** against live Postgres + MinIO. | smoke test |
| C1-006 | **Admin UI (Next.js 15)** — real auth/session (login→token→guard→logout, topbar user), catalog (products list/search/filter/paginate, create, edit + variants, categories, brands), inventory (items + low-stock + stock adjust + locations), **live overview KPIs**. Shared API client + auth context + UI primitives. Verified: `next build` 11 routes + render smoke (/login, /catalog, / → 200). | `apps/admin/src/**` |

## 2026-06-03 — Phase 0 foundation (M0.1 monorepo+infra · M0.2 RLS proven · M0.3/M0.4 cores)

| ID | Description | Evidence / Artifact |
|----|-------------|---------------------|
| C-011 | Scaffolded pnpm + turbo monorepo (apps: web, admin, api, worker; packages: config, db, types, shared, ui, ai-core). **typecheck 14/14, build 9/9 green** | root configs, `apps/**`, `packages/**` |
| C-012 | Docker infra (pgvector/pg16, redis, meilisearch, minio, mailhog) on locked ports; brought up & validated | `docker/docker-compose.yml` |
| C-013 | `@aicos/db`: schema in package, client generated, `db push` created **59 tables + extensions** | `packages/db/prisma/schema.prisma` |
| C-014 | Multi-tenant **RLS**: `withTenant`/`withSystem` helpers + auto `enable-rls.sql` + **two-role model** (`aicos_app` non-superuser) | `packages/db/src/tenant.ts`, `prisma/sql/*`, D-010 |
| C-015 | **Cross-tenant isolation test PASSES (4/4)** against live Postgres — A cannot see/read/write B | `packages/db/test/tenant-isolation.test.ts` |
| C-016 | IAM core (M0.3): argon2 auth, HS256 access/refresh JWT, signup/login/refresh, RBAC guards, AsyncLocalStorage tenant context + middleware | `apps/api/src/{auth,common,tenant}` |
| C-017 | Billing skeleton (M0.4 partial): plans/subscription endpoints, Stripe webhook → BullMQ producer; worker processors (extraction/billing stubs) | `apps/api/src/billing`, `apps/worker/src/queues` |
| C-018 | Seed: 5 plans, platform super admin, demo tenant/owner/store (idempotent) | `packages/db/prisma/seed.ts` |
| C-019 | CI workflow (pgvector+redis services → generate/push/rls/typecheck/lint/build/test) | `.github/workflows/ci.yml` |
| C-020 | Design-system base (`@aicos/ui`) + AI provider abstraction skeleton (`@aicos/ai-core`) | `packages/ui`, `packages/ai-core` |

## 2026-06-03 — Project bootstrap & planning groundwork

| ID | Description | Completed | Evidence / Artifact |
|----|-------------|-----------|---------------------|
| C-001 | Read source-of-truth documents (`CLAUDE_CODE_BASELINE.md` technical, `PROJECT_PROPOSAL.md` business) | 2026-06-03 | `.ai/prompts/2026-06-03-project-startup.md` |
| C-002 | Resolved domain conflict: AICOS = **general e-commerce OS** (proposal overrides restaurant baseline examples) | 2026-06-03 | `.ai/decisions/decision-log.md` D-001 |
| C-003 | `git init`; set local git user (shani81); added `origin` remote (`github.com/shani81/e_commerce_echosystem.git`) | 2026-06-03 | `.git/`, startup prompt log |
| C-004 | Auto-discovered free host ports (machine already runs Postgres/Redis/MinIO/Mailhog on defaults) and **locked** them | 2026-06-03 | `.ai/config/project-ports.json` (D-008) |
| C-005 | Wrote `.gitignore`, `README.md`, `.env.example` | 2026-06-03 | repo root |
| C-006 | Recorded foundational decisions D-001…D-009 | 2026-06-03 | `.ai/decisions/decision-log.md` |
| C-007 | Initialized project memory (durable discoveries, environment quirks, stack lock) | 2026-06-03 | `.ai/memory/project-memory.md` |
| C-008 | Completed research digests: competitors, AI extraction feasibility, payments & shipping, architecture, security, Google ecosystem | 2026-06-03 | `.ai/research/**` |
| C-009 | Confirmed stack lock (Next.js/shadcn, NestJS, Prisma/PG16, Redis/BullMQ, Meilisearch, MinIO/R2, `ai-core` abstraction, pnpm monorepo) | 2026-06-03 | `.ai/memory/project-memory.md`, SPEC |
| C-010 | Scaffolded `.ai/` intelligence directories (`config`, `decisions`, `memory`, `prompts`, `research`, `master-brain`, `tasks`, `releases`) | 2026-06-03 | `.ai/` tree |

## What this completed work establishes
- **Scope is settled:** general e-commerce OS; proposal wins on business, baseline on technical.
- **Environment is known and reproducible:** ports locked, infra-only dockerization, host apps via pnpm.
- **Research is in hand:** every major build decision (multi-tenancy, AI extraction pipeline, payments/shipping, Google, security) is backed by a digest with key facts, implications, and risks.
- **Git + repo hygiene** are in place to start committing planning artifacts.

## Not yet started (tracked elsewhere)
- All implementation tasks (`T-P0-*`, `T-P1-*`) remain **Planned** in `backlog.md`.
- Active planning tasks (`T-PLAN-*`) are in `in-progress.md`.
