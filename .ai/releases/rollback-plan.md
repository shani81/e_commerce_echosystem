# AICOS — Rollback Plan (Generic Template)

> Reusable rollback strategy for any AICOS release. Copy this into a release-specific file (e.g. `.ai/releases/2026-08-12-p0-foundation.md`), fill the placeholders `<…>`, and keep it next to the release. The goal: **any deploy can be reverted to a known-good state quickly, without data loss and without breaking tenant isolation.**
> Last updated: 2026-06-03 (template). Applies to: api, worker, web, admin, database, search, storage, queues.

---

## 0. Release header (fill per release)

| Field | Value |
|-------|-------|
| Release ID / tag | `<vX.Y.Z>` |
| Phase / milestone | `<P0 M0.5 …>` |
| Date / time (UTC) | `<…>` |
| Release owner | `<name>` |
| Previous known-good tag | `<vX.Y.(Z-1)>` |
| Components changed | `<api / worker / web / admin / prisma / meili / infra>` |
| Migration included? | `<yes/no>` — `<migration name>` |
| Feature flags introduced | `<flag names, default state>` |
| Rollback decision owner | `<name>` (single accountable person) |

---

## 1. Rollback principles (non-negotiable)

1. **Prefer flag-off over redeploy.** New behavior ships behind a feature flag where possible; the fastest rollback is disabling the flag — no redeploy, no DB change.
2. **Code rolls back freely; data rolls forward.** Application images are immutable and revertible. **Database migrations are expand/contract and forward-fixed**, not blindly reverted (a down-migration can destroy data). Plan a *forward* fix or a tested reverse migration, never an improvised `prisma migrate reset` in prod.
3. **Tenant isolation must survive rollback.** Rolling back must never drop FORCE RLS, `security_invoker` on views, or the transaction-scoped `set_config` path. An isolation regression is itself a rollback trigger.
4. **Never auto-publish.** Rollbacks of AI/extraction features must not re-enable any auto-publish behavior; the human gate stays intact in all directions.
5. **One decision owner.** A single named person calls the rollback to avoid split-brain during an incident.

---

## 2. Pre-release safety net (do BEFORE deploying)

- [ ] Tag the current production state as the **known-good** image/tag for every component.
- [ ] **Database backup / snapshot** taken and verified restorable (PITR enabled; note the timestamp).
- [ ] Migrations are **expand-phase only** for this release (additive: new nullable columns, new tables, new indexes `CONCURRENTLY`). Defer destructive `DROP`/`NOT NULL` to a later contract release.
- [ ] New code is **backward-compatible** with the previous DB schema (so app can roll back while schema stays forward).
- [ ] Feature flags default **off**; ramp is a separate, reversible step.
- [ ] Meilisearch: index changes are additive; keep the previous index/alias swappable.
- [ ] Object storage: no destructive lifecycle change shipping in the same release as code.
- [ ] BullMQ: new job types are versioned; old workers can still drain the existing queue.
- [ ] Rollback runbook (this file, filled) is linked in the deploy ticket.

---

## 3. Rollback triggers (when to pull the cord)

Roll back (or flag-off) if any of these appear within the watch window (default 60 min):

- Error rate > `<threshold, e.g. 2%>` or p95 latency > `<threshold>` on api/worker.
- **Any sign of cross-tenant data exposure** (Critical — immediate rollback + incident).
- Payment failures / Stripe webhook signature failures spike (orders not created or double-fulfilled).
- Extraction pipeline SLA breach: store-launch flow no longer completes under 15 min, or queue depth climbs without drain.
- AI cost anomaly: spend per tenant/hour exceeds budget guardrail (possible cost bomb).
- Auth/IAM regression locking tenants out, or RBAC allowing unauthorized actions.
- Migration applied but app erroring against it (schema/app mismatch).
- Health/readiness probes failing post-deploy beyond the grace period.

---

## 4. Rollback procedures by layer

### 4.1 Fastest path — feature flag off
1. Disable the flag(s) listed in the header.
2. Confirm metrics return to baseline within `<N>` minutes.
3. If resolved, no redeploy needed; record and schedule the fix-forward.

### 4.2 Application (api / worker / web / admin)
1. Decision owner declares rollback; freeze further deploys.
2. **Kubernetes:** `kubectl rollout undo deployment/<name>` (or re-deploy the previous known-good image tag) for each affected deployment. Roll back **api and worker together** if they share a contract.
3. **Docker Compose (lower envs):** redeploy the previous image tags.
4. Wait for readiness probes green; verify health endpoints.
5. Confirm the app is compatible with the **current** DB schema (it must be, per expand/contract).

### 4.3 Database / Prisma migrations
1. **Default = roll forward.** If the migration is additive and the previous app works against it, **leave the schema in place** and roll back only the app. This is the safe and usual case.
2. If the migration itself is the fault and a **tested** reverse migration exists, apply it as a **new pre-deploy Job** (never in-process), after taking a fresh snapshot.
3. If data corruption occurred, restore from the pre-release snapshot / PITR to the recorded timestamp — accept the documented RPO data loss window and notify affected tenants.
4. **Never** run `prisma migrate reset`, `DROP`, or session-scoped `set_config` in production during a rollback.
5. Re-verify RLS: FORCE RLS present on all tenant tables, all views `security_invoker=true`, cross-tenant isolation test passes against the rolled-back state.

### 4.4 Search (Meilisearch)
1. Swap the index alias back to the previous index version (additive index changes make this instant).
2. If documents were re-indexed destructively, re-run the indexing job from the DB (source of truth) for affected tenants.
3. Re-issue tenant-token config if token schema changed; confirm no master key reached the frontend.

### 4.5 Queues (BullMQ / Redis)
1. Pause new job intake for the affected queue if jobs are failing/poisoning.
2. Move failed jobs to a holding/DLQ; do **not** mass-retry against rolled-back code blindly.
3. Because jobs use deterministic, idempotent IDs (`tenantId + s3ETag + segmentIndex`), safe re-processing is possible once code is stable.
4. Drain the queue with the restored worker version; confirm no duplicate side effects (orders, charges).

### 4.6 Object storage (R2 / S3 / MinIO)
1. Storage is mostly append/immutable; no rollback usually needed.
2. If a lifecycle/permission change shipped and caused issues, revert that policy; restore objects from versioning if enabled.
3. Re-validate pre-signed URL generation and the `temp/` 48-hour lifecycle rule still function.

### 4.7 Payments (Stripe)
1. Pin the Stripe API version back to the previous value if the release bumped it.
2. Reconcile: ensure no orders were double-created from webhook replays; verify event-ID dedupe held.
3. For destination-charge refund/chargeback flows, confirm platform-balance reserves are intact after rollback.

### 4.8 Third-party integrations (Google, shipping)
1. Feature-flag off the affected integration rather than rolling back the whole app where possible.
2. Google: never silently re-enable a partial-grant path that fails hard; surface "reconnect" prompts.
3. Shipping: fall back to the previous `ShippingProvider` implementation behind the interface.

---

## 5. Post-rollback verification checklist

- [ ] Health/readiness green on api, worker, web, admin.
- [ ] **Cross-tenant isolation test passes** (FORCE RLS, `security_invoker`, transaction-scoped context).
- [ ] Auth/login + RBAC behave correctly for each persona.
- [ ] A test checkout completes (tax, destination charge, order created exactly once, label/tracking).
- [ ] Search returns correct, tenant-isolated results via tenant token (no master key in client bundle).
- [ ] No AI auto-publish path is active; human gate intact.
- [ ] AI spend back within budget guardrails; no anomalous draw.
- [ ] Error rate / p95 latency back to baseline for the full watch window.
- [ ] Queues draining cleanly; no duplicate side effects.

---

## 6. Communication & records

- **Status updates:** post to `<incident channel>` at declare, mid-rollback, and resolution.
- **Tenant comms:** if any tenant-visible impact or data-loss window, notify affected tenants with scope + timeframe.
- **Incident record:** open `<incident ID>`; attach this filled template, timeline, and metrics.
- **Blameless postmortem:** within `<X>` business days; capture root cause, the trigger that fired, what slowed recovery, and concrete preventive actions.

## 7. Targets

| Metric | Target |
|--------|--------|
| Time-to-detect (alert → human aware) | `<≤ 5 min>` |
| Time-to-decide (aware → rollback called) | `<≤ 10 min>` |
| Time-to-recover (called → baseline restored) | `<≤ 30 min>` |
| RPO (max acceptable data loss) | `<≤ 5 min via PITR>` |
| RTO (max acceptable downtime) | `<≤ 30 min>` |

> Fill the placeholders per release. If a release ships a migration, this file MUST state explicitly whether a tested reverse migration exists or the strategy is roll-forward-only.
