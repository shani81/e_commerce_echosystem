# AICOS — In Progress

> We are in **PHASE 0 — Foundation**, now in implementation. Branch: `phase-0-foundation`.
> Last updated: 2026-06-03.

## Phase 0 milestones

| Milestone | Status | Notes |
|-----------|--------|-------|
| M0.1 Monorepo + Compose infra + CI skeleton | ✅ Done | typecheck 14/14, build 9/9; CI green-path defined |
| M0.2 Prisma schema v0 + RLS + FORCE; cross-tenant isolation test | ✅ Done | Isolation test **passes (4/4)**; two-role RLS model (D-010) |
| M0.3 IAM: auth + RBAC + tenant context | 🟨 In Progress | Core done (auth/JWT/RBAC/ALS). Remaining: switch HS256→RS256 keys, team-invite/membership write endpoints, multi-tenant login selection |
| M0.4 Billing skeleton + Stripe webhooks via BullMQ | 🟨 In Progress | Endpoints + webhook→queue producer + worker processor stub done. Remaining: real Stripe signature verification (add SDK), idempotency on event id, metered-usage plumbing |
| M0.5 Design system + observability + dashboard | 🟨 In Progress | `@aicos/ui` base + nestjs-pino logging done. Remaining: observability (OpenTelemetry/metrics), health dashboards, P0 exit review |

## Immediate follow-ups (carried from scaffold verification)
- Move JWT signing to **RS256** (tenant-model specifies it); generate dev keypair.
- Wire **real Stripe** signature verification in `StripeWebhookController` (raw body already available) + worker idempotency keyed on event id.
- Collapse `apps/worker/src/queues/contracts.ts` into `@aicos/shared` once its queue surface is stable (producer/consumer in lockstep).
- Add API **CORS allow-list** for `http://localhost:3000` and `:3100` so the storefront/admin health probes succeed.
- Wire `@aicos/db` build + `prisma generate` into a fresh-clone bootstrap doc (`pnpm install && pnpm db:setup`).

## Next (M0.5 → Phase 1 entry)
1. Observability baseline (request logging is in; add metrics + error tracking).
2. P0 exit review against `enterprise-readiness.md`.
3. Begin **Phase 1 — Core Commerce**: catalog → inventory → orders → payments (see `backlog.md`).
