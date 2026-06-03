# Project Memory

Durable discoveries, lessons, and reusable insights. Append newest at top.

## 2026-06-03 — Project bootstrap
- **What this is:** AICOS = AI Commerce OS. Store owner films shelves → AI extracts catalog → human review → Publish → live store in <15 min. General e-commerce (not restaurants).
- **Source of truth:** `PROJECT_PROPOSAL.md` (business) + `CLAUDE_CODE_BASELINE.md` (technical). On conflict, proposal wins on business, baseline on technical.
- **Operating model (baseline):** maintain the `.ai/` intelligence system (Master Brain, research, decisions, registries) and keep `project-dashboard.html` current. Reuse before create; search before generate; never lose knowledge.
- **Environment quirk:** this dev machine already has Postgres/Redis/MinIO/Mailhog listening on default ports → AICOS infra uses remapped ports (see `.ai/config/project-ports.json`). Always check that file before assuming a port.
- **Stack locked:** Next.js + shadcn (web/admin), NestJS (api), Prisma + Postgres, Redis/BullMQ, Meilisearch, MinIO/S3, AI provider-abstraction (Claude default), pnpm monorepo.
- **Flagship & hardest piece:** the AI Product Extraction Engine (video → products). Confidence scoring + human verification are mandatory; nothing auto-publishes.

## Lessons learned
- _(none yet)_
