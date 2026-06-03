# @aicos/worker

The AICOS **background worker** — a NestJS 11 app that hosts the BullMQ queue
processors. It runs separately from `apps/api` so long-running, retryable work
(the AI product-extraction pipeline, Stripe billing side-effects) never blocks
HTTP requests and can scale independently.

> **Phase 0:** skeleton only. The processors are deliberately wired **stubs** —
> they receive, type, log, and ack real jobs but make **no** AI/FFmpeg/S3/Stripe
> calls. They prove the API→Redis→worker path end-to-end so later phases can drop
> in the real stage logic without rewiring.

## Layout

```
src/
  main.ts                       bootstrap: Nest HTTP app + nestjs-pino + graceful shutdown
  app.module.ts                 ConfigModule (global) · LoggerModule · BullModule.forRoot(REDIS_URL) · PrismaModule · QueuesModule
  health/health.controller.ts   GET /health on :4100 (liveness)
  prisma/
    prisma.module.ts            global module exposing PrismaService
    prisma.service.ts           wraps createPrismaClient() from @aicos/db; owns connect/disconnect
  queues/
    contracts.ts                queue names, job names, payload types, deterministic jobId helper (API⇄worker wire contract)
    queues.module.ts            registers the `extraction` and `billing` queues + binds processors
    extraction.processor.ts     @Processor('extraction') — walks pipeline stages (validate→sample→analyze→refine→merge→enrich→publish) as no-ops
    billing.processor.ts        @Processor('billing') — handles `stripe.event` jobs (stub)
```

## Queues

| Queue        | Job name         | Payload (`contracts.ts`) | Phase 0 behaviour |
|--------------|------------------|--------------------------|-------------------|
| `extraction` | `extraction.run` | `ExtractionJobData`      | logs + iterates the 7 named pipeline stages as no-ops, reporting progress |
| `billing`    | `stripe.event`   | `StripeEventJobData`     | logs the Stripe event and acks; no Stripe call |

The queue/job **names** and **payload shapes** are the contract with the API
producer. When `@aicos/shared` exposes a stable queue surface, `contracts.ts`
can re-export from it without changing any processor.

### Idempotency

Both processors are safe under BullMQ at-least-once redelivery. Producers derive
a **deterministic job id** — `hash(tenantId + s3ETag + segmentIndex + stage)`
via `extractionJobId()` — so BullMQ silently ignores duplicate `add()` calls
(decision XT-10). The Phase 0 stubs are additionally pure no-ops, so re-running a
job changes nothing.

## Database access

`PrismaService` wraps `createPrismaClient()` from **`@aicos/db`** (never
`@prisma/client` directly). Tenant-scoped reads/writes must go through
`withTenant()`; trusted cross-tenant work (e.g. billing) through `withSystem()` —
both imported from `@aicos/db`.

## Run

From the repo root (after `pnpm install`):

```bash
# 1. infra (Postgres + Redis) — Redis is required for the worker to boot
pnpm infra:up

# 2. worker in watch mode
pnpm --filter @aicos/worker dev

# health check
curl http://localhost:4100/health
# → {"status":"ok","service":"worker","uptime":3,"timestamp":"..."}
```

### Scripts

| Script | Action |
|--------|--------|
| `pnpm --filter @aicos/worker build` | `nest build` → `dist/` |
| `pnpm --filter @aicos/worker dev` | `nest start --watch` |
| `pnpm --filter @aicos/worker start` | `node dist/main.js` (prod) |
| `pnpm --filter @aicos/worker lint` | `eslint src` |
| `pnpm --filter @aicos/worker typecheck` | `tsc --noEmit` |

## Configuration

Reads from the repo-root `.env` (see `.env.example`). Relevant keys:

| Var | Default | Purpose |
|-----|---------|---------|
| `REDIS_URL` | `redis://localhost:6400` | BullMQ connection |
| `DATABASE_URL` | — | Prisma (via `@aicos/db`) |
| `WORKER_PORT` | `4100` | health endpoint port |
| `NODE_ENV` | `development` | dev = pretty logs; prod = JSON |

## Ports

Health endpoint is fixed at **4100** (locked alongside web 3000, admin 3100,
api 4000).
