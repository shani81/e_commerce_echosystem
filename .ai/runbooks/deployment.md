# Runbook — Deployment / Ops (Phase 2 · P2.5)

Containerizes the backend services and documents how they run + get their secrets.
Infra (Postgres/Redis/Meili/MinIO/Mailhog) is already dockerized; this adds the
**app images** + a compose overlay + a CI image build.

## Images
- `apps/api/Dockerfile` — NestJS HTTP API (port 4000).
- `apps/worker/Dockerfile` — BullMQ processors (health on 4100).

Both are pnpm-monorepo multi-stage builds: install the workspace → `prisma generate`
(on the alpine target, so the engine matches) → build the app + its workspace deps.
CI (`.github/workflows/ci.yml`, `docker` job) builds both on every PR.

> Optimization (follow-up): switch the runtime stage to `pnpm deploy --prod` +
> distroless/non-root to shrink the image and drop dev deps/source. Web/admin
> (Next.js `output: 'standalone'`) Dockerfiles are also a follow-up — they run on
> the host (`pnpm dev`) today.

## Run the full stack (apps + infra) locally
```
# 1) JWT keys — containers read them via env or the mounted .keys dir
pnpm keys:gen                      # writes .keys/ (mounted read-only into the api)

# 2) First run: bring up infra, then migrate + seed the containerized DB
pnpm infra:up
pnpm db:push && pnpm db:rls && pnpm db:seed   # against localhost:5440

# 3) Build + run the app containers alongside infra
docker compose -f docker/docker-compose.yml -f docker/docker-compose.apps.yml --env-file .env up -d --build
```
Inside the compose network the apps reach infra by service name (`postgres:5432`,
`redis:6379`, `meilisearch:7700`, `minio:9000`, `mailhog:1025`) — see
`docker/docker-compose.apps.yml`.

## Secrets (Doppler in prod)
Local dev uses `.env` (gitignored) + `.keys/`. **Never bake secrets into an image**
(`.dockerignore` excludes `.env` and `.keys`). For staging/prod, source secrets from
a manager — **Doppler** is the chosen tool:
```
doppler run -- docker compose -f docker/docker-compose.yml -f docker/docker-compose.apps.yml up -d
```
Required secrets: `DATABASE_URL`, `APP_DATABASE_URL`, `REDIS_URL`, `JWT_PRIVATE_KEY`,
`JWT_PUBLIC_KEY` (base64/PEM), `JWT_REFRESH_SECRET`, `MEILI_MASTER_KEY`, S3/R2 creds,
SMTP creds, `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`, `SHIPPO_API_KEY`, AI provider keys.

## Production notes
- Run DB migrations (`prisma migrate deploy`) as a release step before rolling apps.
- Scale the worker on **queue depth** (KEDA) using `aicos_queue_depth` (P2.4) — see
  `.ai/runbooks/observability.md`.
- Move the rate-limiter + queue-metrics storage to Redis when running >1 instance.
- Terminate TLS at the edge; set `NODE_ENV=production` so cookies are `Secure`.
