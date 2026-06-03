# AI Commerce OS (AICOS)

> Walk into your store → film the shelves → upload → review → **Publish**. A complete, AI-built online store in under 15 minutes.

AICOS is a next-generation, AI-first, multi-tenant **E-Commerce Operating System** that lets any non-technical store owner go from a physical store to a fully operational online store with almost zero manual work. The flagship capability is the **AI Product Extraction Engine**: a short store video is turned into a full product catalog (names, prices, variants, images, SEO) by AI, reviewed by a human, and published.

---

## Status

🟨 **Phase 0 — Foundation (in progress).** The monorepo is scaffolded and the foundation is built & verified: multi-tenant **Postgres RLS** (cross-tenant isolation test passing), **IAM** (RS256 JWT auth, RBAC, AsyncLocalStorage tenant context), a **billing skeleton** with real Stripe webhook verification, Docker infra, CI, and an observability baseline (Prometheus `/metrics`, structured logs, health probes).

- **Run it locally:** **[DEVELOPMENT.md](DEVELOPMENT.md)** — fresh clone → running in ~5 minutes.
- **Project dashboard:** open [`project-dashboard.html`](project-dashboard.html) for the executive view (progress, roadmap, risks, readiness scores, local URLs & credentials).
- **Strategic brain & intelligence system:** see [`.ai/`](.ai/) — vision, business model, ecosystem/module maps, research, decisions, registries, and current tasks.
- **Source of truth:** [`PROJECT_PROPOSAL.md`](PROJECT_PROPOSAL.md) (business) + [`CLAUDE_CODE_BASELINE.md`](CLAUDE_CODE_BASELINE.md) (technical standards & operating rules).

---

## Technology Stack

| Layer | Technology |
|------|------------|
| Frontend | TypeScript · React · Next.js · Tailwind CSS · shadcn/ui · Framer Motion |
| Backend | TypeScript · Node.js (LTS) · NestJS |
| Database | PostgreSQL · Prisma ORM |
| Cache / Queues | Redis · BullMQ |
| Search | Meilisearch |
| Storage | S3-compatible (MinIO local · Cloudflare R2 / AWS S3 prod) |
| AI | Provider-abstraction layer over OpenAI · Anthropic Claude · Google Gemini |
| Infra (local) | Docker Compose (infrastructure only) |
| Package manager | **pnpm** (npm/yarn are not used) |

## Local Service Ports (locked)

App ports are conflict-free defaults; infra ports are remapped to avoid clashing with services already running on this machine. Authoritative source: [`.ai/config/project-ports.json`](.ai/config/project-ports.json).

| Service | URL / Port |
|--------|-----------|
| Storefront (web) | http://localhost:3000 |
| Admin dashboard | http://localhost:3100 |
| API (NestJS) | http://localhost:4000 |
| Queue/worker dashboard | http://localhost:4100 |
| PostgreSQL | localhost:5440 |
| Redis | localhost:6400 |
| Meilisearch | http://localhost:7700 |
| MinIO (S3) | http://localhost:9200 (console 9300) |
| Mailhog | http://localhost:8100 (SMTP 1200) |

---

## Repository Layout (target)

```
apps/            # web (storefront), admin, api (NestJS)
packages/        # ui (design system), config, types, ai-core, shared
docker/          # infrastructure compose + service configs
prisma/          # schema, migrations, seeds
.ai/             # strategic brain, research, decisions, registries (intelligence system)
project-dashboard.html
```

## Principles

Reuse before create · API-first · Multi-tenant by design · Security first · Automation first · Customer-first · Mobile-first. See [`.ai/master-brain/platform-principles.md`](.ai/master-brain/platform-principles.md).
