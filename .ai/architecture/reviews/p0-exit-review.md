# Phase 0 — Exit Review

**Date:** 2026-06-03 · **Branch:** `phase-0-foundation` · **Reviewer:** Architecture Review Board (automated)
**Decision: 🟢 GO for Phase 1 — Core Commerce MVP.** The foundation is built, verified end-to-end, and consistent with the SPEC. A small set of non-blocking items is carried forward (below).

## Milestone status

| Milestone | Status | Evidence |
|-----------|--------|----------|
| **M0.1** Monorepo + Docker infra + CI | ✅ Done | pnpm + turbo; `apps/{web,admin,api,worker}` + `packages/{db,config,types,shared,ui,ai-core}`. typecheck 14/14, build 9/9. Docker infra (pgvector pg16, redis, meili, minio, mailhog) on locked ports. CI green-path. |
| **M0.2** Prisma + RLS + isolation test | ✅ Done | 59-model schema pushed (+extensions). **Cross-tenant isolation test passes 4/4** against live Postgres. Two-role model (owner vs `aicos_app`) so RLS is genuinely enforced (D-010). |
| **M0.3** IAM: auth + RBAC + tenant ctx | ✅ Done | argon2 + **RS256** access JWT (alg-pinned verify) + HS256 refresh w/ rotatable sessions. Global JwtAuthGuard + RolesGuard. AsyncLocalStorage tenant context. Verified: signup→RS256 token→`/auth/me` verifies via public key (D-012). |
| **M0.4** Billing skeleton + Stripe webhooks | ✅ Done (skeleton) | **Real Stripe signature verification** on `req.rawBody`; verified event → BullMQ → worker **processed once** (jobId dedup + Redis idempotency marker). Producer/consumer contract single-sourced in `@aicos/shared`. Plans/subscription read endpoints. Verified: valid→200, bad/missing→400, duplicate deduped. |
| **M0.5** Design system + observability | ✅ Done | `@aicos/ui` base + AI provider-abstraction skeleton. **Observability baseline:** Prometheus `/metrics` (api: HTTP histogram + default Node metrics; worker: default metrics), structured pino request logs w/ correlation ids + secret redaction, Terminus health/readiness (DB + Redis), graceful shutdown. |

## Quality gates (all green)
- **typecheck** 14/14 · **build** 9/9 · **lint** clean (0 errors) · **tests** pass (incl. RLS isolation).
- Runtime-verified: api boots & serves; worker boots & processes jobs; auth, webhook, and metrics flows confirmed against live Postgres + Redis.

## Readiness (design+foundation stage, 0–100)
Architecture 66 · Tenant isolation 55 · Documentation 72 · Scalability 40 · Security 40 · Performance 16 · UI/UX 24 · Code quality 32 · Enterprise readiness 36 · **Overall 38.**
Rationale: isolation/auth/observability are real and tested; UI and feature breadth are intentionally minimal at P0; perf/scale unproven under load (expected).

## Key risks — status
- **Cross-tenant leakage (Critical):** mitigated & **proven** — FORCE RLS + `aicos_app` non-superuser role + `withTenant`/`withSystem` + passing isolation test in CI.
- **RLS CVEs (<16.9):** pinned `pgvector/pgvector:pg16` (≥16.9).
- **AI cost bomb / webhook abuse:** webhook signature verification in place; AI credit guards land with the AI phase.
- **Stripe chargeback liability:** dispute models exist in schema; dispute-evidence workflow is a P1 item.

## Carried forward (non-blocking)
1. **Auth:** team-invite/membership write endpoints; multi-tenant login selection (currently earliest active membership); refresh-key rotation runbook.
2. **Billing:** metered-usage plumbing + real subscription/invoice sync (belongs to the dedicated billing phase); Stripe SDK calls beyond webhook verification.
3. **Observability:** OpenTelemetry tracing + BullMQ queue-depth gauges + dashboards/alerts (metrics baseline is in).
4. **Ops:** secrets via Doppler (currently env/.keys); container images for apps (infra-only dockerized today); load/perf testing.
5. **Search/i18n/store-builder** schema entities remain phase-deferred per `../../database/schema-design.md`.

## Phase 1 entry criteria — met
- Tenant isolation guaranteed at the DB layer ✔ · Auth/RBAC/tenant-context backbone ✔ · Build/CI/observability ✔ · Canonical schema + API registry to build against ✔.

**Proceed to Phase 1: catalog → inventory → orders → payments → shipping → customers/portal → storefront → search → media → notifications.** See `../../tasks/backlog.md`.
