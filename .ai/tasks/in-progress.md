# AICOS — In Progress

> We are in **PHASE 0 — Foundation**, now in implementation. Branch: `phase-0-foundation`.
> Last updated: 2026-06-03.

## Phase 0 milestones

| Milestone | Status | Notes |
|-----------|--------|-------|
| M0.1 Monorepo + Compose infra + CI skeleton | ✅ Done | typecheck 14/14, build 9/9; CI green-path defined |
| M0.2 Prisma schema v0 + RLS + FORCE; cross-tenant isolation test | ✅ Done | Isolation test **passes (4/4)**; two-role RLS model (D-010) |
| M0.3 IAM: auth + RBAC + tenant context | 🟨 In Progress | Core done; **JWT now RS256** (access = RS256 keypair, refresh = HS256, verify pins `algorithms:['RS256']`). Remaining: team-invite/membership write endpoints, multi-tenant login selection |
| M0.4 Billing skeleton + Stripe webhooks via BullMQ | 🟨 In Progress | Endpoints + **real Stripe signature verification** (`constructEvent` on the raw body) + worker processing with **event-id idempotency** (jobId dedup + Redis marker) done & **verified** (valid→200, bad/missing→400, duplicate processed once). Remaining: metered-usage plumbing, real subscription/invoice sync |
| M0.5 Design system + observability + dashboard | 🟨 In Progress | `@aicos/ui` base + nestjs-pino logging done. Remaining: observability (OpenTelemetry/metrics), health dashboards, P0 exit review |

## Immediate follow-ups (carried from scaffold verification)
- ✅ JWT signing moved to **RS256** (access RS256 keypair + alg-pinned verify; refresh HS256). Keys via `pnpm keys:gen`. **Verified end-to-end** (token header `alg:RS256`, `/auth/me` verifies via public key).
- ✅ API **CORS allow-list** is env-driven (`CORS_ORIGINS`, defaults to localhost:3000/3100 in `.env.example`).
- ✅ Nest builds set `incremental:false` in the shared preset (fixes `deleteOutDir` dropping modules from `dist/`).
- ✅ **Real Stripe** webhook signature verification (`StripeService.constructEvent` on `req.rawBody`) + worker **event-id idempotency** (jobId dedup + Redis processed-marker). Verified e2e.
- ✅ **Billing queue contract single-sourced in `@aicos/shared`** — api producer + worker consumer both import it (fixed a real drift: api enqueued `stripe-webhook`, worker only handled `stripe.event`). Worker `contracts.ts` is now a thin re-export.
- ⏭️ Fresh-clone bootstrap doc: `pnpm install && pnpm keys:gen && pnpm infra:up && pnpm db:setup`. **(next)**
- ⏭️ M0.5: observability baseline (metrics/error tracking) → P0 exit review.

## Next (M0.5 → Phase 1 entry)
1. Observability baseline (request logging is in; add metrics + error tracking).
2. P0 exit review against `enterprise-readiness.md`.
3. Begin **Phase 1 — Core Commerce**: catalog → inventory → orders → payments (see `backlog.md`).
