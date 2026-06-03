# AICOS — In Progress

> Tasks actively being worked right now. We are in **PHASE 0 (planning)** — the only active work is the planning/design effort itself; no implementation tasks have started.
> Last updated: 2026-06-03.

| ID | Description | Owner role | Started | Status | Notes |
|----|-------------|-----------|---------|--------|-------|
| T-PLAN-01 | Produce Master Brain set: platform roadmap, strategic decisions, risk register, enterprise readiness | Program/Delivery Lead | 2026-06-03 | In Progress | Roadmap + decisions + risks + readiness drafted under `.ai/master-brain/` |
| T-PLAN-02 | Seed task system: backlog (P0 + early P1), in-progress, completed | Program/Delivery Lead | 2026-06-03 | In Progress | This file + `backlog.md` + `completed.md` |
| T-PLAN-03 | Author generic rollback-plan template | Program/Delivery Lead | 2026-06-03 | In Progress | `.ai/releases/rollback-plan.md` |
| T-PLAN-04 | Keep `project-dashboard.html` consistent with finalized plan (phases, milestones, last-updated) | Program/Delivery Lead | 2026-06-03 | In Progress | Reflect P0 = ~15% in progress, others Planned |

## Definition of done for the planning phase (T-PLAN-*)
- All Master Brain docs present, internally consistent, and aligned with `PROJECT_PROPOSAL.md` + SPEC names/modules/phases.
- Backlog covers all P0 tasks + the first P1 commerce slice with dependencies and Planned status.
- Rollback template is generic and reusable across phases.
- Dashboard reflects current status. On approval, T-P0-* implementation tasks move here from `backlog.md`.

## Next to pick up (on plan approval)
1. T-P0-REPO-01 — scaffold the pnpm monorepo.
2. T-P0-INFRA-01 — Docker Compose infra on locked ports (Postgres 16.9+).
3. T-P0-DB-01/02/03 — Prisma schema v0 + RLS + FORCE + `withTenant`.
