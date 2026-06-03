# Project Memory

Durable discoveries, lessons, and reusable insights. Append newest at top.

## 2026-06-03 — Project bootstrap
- **What this is:** AICOS = AI Commerce OS. Store owner films shelves → AI extracts catalog → human review → Publish → live store in <15 min. General e-commerce (not restaurants).
- **Source of truth:** `PROJECT_PROPOSAL.md` (business) + `CLAUDE_CODE_BASELINE.md` (technical). On conflict, proposal wins on business, baseline on technical.
- **Operating model (baseline):** maintain the `.ai/` intelligence system (Master Brain, research, decisions, registries) and keep `project-dashboard.html` current. Reuse before create; search before generate; never lose knowledge.
- **Environment quirk:** this dev machine already has Postgres/Redis/MinIO/Mailhog listening on default ports → AICOS infra uses remapped ports (see `.ai/config/project-ports.json`). Always check that file before assuming a port.
- **Stack locked:** Next.js + shadcn (web/admin), NestJS (api), Prisma + Postgres, Redis/BullMQ, Meilisearch, MinIO/S3, AI provider-abstraction (Claude default), pnpm monorepo.
- **Flagship & hardest piece:** the AI Product Extraction Engine (video → products). Confidence scoring + human verification are mandatory; nothing auto-publishes.

## 2026-06-03 — Phase 0 foundation lessons
- **RLS + superuser is a trap.** PostgreSQL superusers AND `BYPASSRLS` roles silently ignore RLS — even with `FORCE ROW LEVEL SECURITY`. The default `POSTGRES_USER` (`aicos`) is a superuser, so the app saw ALL tenants until we connected as a dedicated **non-superuser role `aicos_app`** (`APP_DATABASE_URL`). Owner role (`DATABASE_URL`) is for migrations/seed only. The isolation test caught this — keep that test in CI.
- **Two Prisma connections:** `createPrismaClient()` → app role (RLS on); `createOwnerClient()` → owner (migrations/seed/RLS DDL). `db:rls` creates the app role + grants, then applies policies.
- **pgvector image required:** the schema enables the `vector` extension, so Postgres must be `pgvector/pgvector:pg16` — stock `postgres:16` fails `prisma db push`.
- **Windows Prisma `EPERM` on generate** = a stray Node process still holds `query_engine-windows.dll.node`. Find it (`Get-CimInstance Win32_Process -Filter "Name='node.exe'"`) and stop just that PID; don't blanket-kill node (the harness + other projects run node too — e.g. `D:\Projects\social_media_marketing`).
- **Tailwind config can't import the `@aicos/ui` barrel** (it pulls in `.tsx` components Node can't resolve at config-eval time) — import tokens from `packages/ui/src/tokens` directly.
- **Bootstrap a fresh clone:** `pnpm install` → `pnpm infra:up` → `pnpm db:setup` (generate→push→rls→seed).

## Lessons learned (older)
- _(none yet)_
