# AICOS — Local Development

Get the monorepo running from a fresh clone in ~5 minutes.

## Prerequisites
- **Node.js ≥ 20** (22 recommended — see [.nvmrc](.nvmrc))
- **pnpm 9** — `corepack enable && corepack prepare pnpm@9.15.9 --activate`
- **Docker** (Desktop or Engine) for the local infrastructure

## First-time setup

```bash
# 1. Install all workspace dependencies
pnpm install

# 2. Generate the dev RS256 JWT keypair into .keys/ (gitignored)
pnpm keys:gen

# 3. Create your local env file (defaults already match docker + locked ports)
cp .env.example .env

# 4. Start infrastructure (Postgres+pgvector, Redis, Meilisearch, MinIO, Mailhog)
pnpm infra:up

# 5. Create the schema, apply RLS, and seed (plans + super admin + demo tenant)
pnpm db:setup
```

`pnpm db:setup` runs `db:generate → db:push → db:rls → db:seed`. The `db:rls` step also creates the least-privilege **`aicos_app`** runtime role (the app connects as it so Postgres Row-Level Security is actually enforced; migrations/seed use the owner role).

## Run the apps

```bash
pnpm dev            # all apps via turbo (storefront, admin, api, worker)
# or individually:
pnpm --filter @aicos/api dev
pnpm --filter @aicos/worker dev
pnpm --filter @aicos/web dev
pnpm --filter @aicos/admin dev
```

| Service | URL |
|--------|-----|
| Storefront (web) | http://localhost:3000 |
| Admin dashboard | http://localhost:3100 |
| API (NestJS) | http://localhost:4000/api/v1 |
| API health / metrics | http://localhost:4000/api/v1/health · http://localhost:4000/metrics |
| Worker health / metrics | http://localhost:4100/health · http://localhost:4100/metrics |
| Meilisearch | http://localhost:7700 |
| MinIO console | http://localhost:9300 |
| Mailhog | http://localhost:8100 |

**Dev credentials** (seeded; local only): super admin `superadmin@aicos.local` / `SuperAdmin!2026`, demo owner `admin@aicos.local` / `Admin!2026`. Full list at the top of [project-dashboard.html](project-dashboard.html).

## Everyday commands

| Command | Action |
|--------|--------|
| `pnpm typecheck` | Typecheck every package/app (turbo) |
| `pnpm build` | Build everything |
| `pnpm lint` | Lint everything |
| `pnpm test` | Run tests (incl. the cross-tenant RLS isolation test) |
| `pnpm db:studio` | Open Prisma Studio |
| `pnpm db:rls` | Re-apply RLS after a schema change (`db:push`) |
| `pnpm infra:down` | Stop the infrastructure containers |
| `pnpm keys:gen --force` | Rotate the dev JWT keypair |

## Environment notes
- The root [.env](.env.example) is the single source for local dev — the API and worker both fall back to it. App-specific `apps/*/.env` overrides it if present.
- **Two DB roles:** `DATABASE_URL` (owner — migrations/seed, bypasses RLS) and `APP_DATABASE_URL` (`aicos_app` — runtime, RLS enforced). See [tenant-model](.ai/master-brain/tenant-model.md).
- JWT access tokens are **RS256**; keys load from `.keys/` (or inline `JWT_PRIVATE_KEY`/`JWT_PUBLIC_KEY` for CI/prod). Refresh tokens are HS256 via `JWT_REFRESH_SECRET`.
- Stripe webhooks need `STRIPE_WEBHOOK_SECRET` to verify; without it the endpoint returns 503.

## Troubleshooting (Windows-friendly)
- **`prisma generate` fails with `EPERM` on `query_engine-windows.dll.node`** — a stray Node process still holds the engine. Find it with `Get-CimInstance Win32_Process -Filter "Name='node.exe'"` and stop just that PID (don't blanket-kill Node).
- **`prisma db push` fails on the `vector` extension** — Postgres must be the `pgvector/pgvector:pg16` image (it is, in [docker/docker-compose.yml](docker/docker-compose.yml)). Stock `postgres:16` won't work.
- **RLS lets you see everything** — you're connecting as a superuser. The app must use `APP_DATABASE_URL` (the non-superuser `aicos_app` role); superusers/BYPASSRLS bypass RLS.
- **Port already in use** — infra ports were remapped because this is a shared machine; the locked set is in [.ai/config/project-ports.json](.ai/config/project-ports.json).

## CI
[.github/workflows/ci.yml](.github/workflows/ci.yml) spins up Postgres (pgvector) + Redis, then runs `db:generate → db:push → db:rls → typecheck → lint → build → test`.
