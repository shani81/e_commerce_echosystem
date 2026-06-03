# Master Summary — AICOS

> One-page orientation. A new agent or developer should understand AICOS in minutes from this file. Last updated: 2026-06-03.

## What it is
**AI Commerce OS (AICOS)** — an AI-first, multi-tenant **e-commerce operating system**. A non-technical store owner films their shelves, uploads the video, AI extracts the full catalog (names, prices, variants, images, SEO) with per-field confidence, the owner reviews and clicks **Publish**, and a complete operational online store goes live in **under 15 minutes**. General e-commerce for any physical store (grocery, fashion, electronics, pharmacy, beauty, furniture…), not restaurant-specific.

- **North-star metric:** time-from-video-to-live-store < 15 min; ≥70% of extracted drafts land ≥0.65 confidence.
- **Flagship & hardest piece:** the AI Product Extraction Engine (`ai-extraction`) — a 12-stage BullMQ pipeline, Gemini-first + Claude fallback, with a **mandatory human verification gate** (nothing AI-generated auto-publishes).

## Current status (health)
- **Phase 0 — Foundation (planning).** No application code yet; this is the strategic plan + schema design + scaffolding config.
- **Overall health: 24/100** · **Enterprise readiness: 22/100** (honest design-stage scores — architecture 60, documentation 65 lead; code 8, performance 10 because nothing is implemented).
- Deliverables produced: 9 Master-Brain docs, 6 research dossiers, system architecture, **54→59-model Prisma schema**, **317-endpoint API registry**, 12-agent AI spec, flagship feature pack, roadmap + risk register.

## Roadmap (priorities)
| Phase | Focus | ETA |
|------|-------|-----|
| **P0** Foundation | Monorepo, Docker infra, IAM + multi-tenancy, billing skeleton, design system, CI | 2026-08-12 |
| **P1** Core Commerce MVP | Catalog, inventory, orders, Stripe, shipping, customers+portal, admin, storefront, search | 2026-12-09 |
| **P2** The Magic | AI provider abstraction + the flagship video→catalog pipeline + content/SEO | 2027-03-31 ⚠ highest uncertainty |
| **P3** AI Store Builder | Store generation, website cloning, theme engine | 2027-06-09 |
| **P4** Growth & Intelligence | Google ecosystem, marketing/CS/pricing agents, analytics | 2027-10-06 |
| **P5** Scale & Enterprise | Automation, K8s/multi-region, white-label, SOC2 path | 2028-01-26 |

## Architecture in one breath
pnpm monorepo — `apps/{web,admin,api,worker}` + `packages/{ui,config,types,ai-core,shared}`. Next.js + shadcn frontends; **NestJS** modular backend (controller→service→repository); **PostgreSQL + Prisma**; Redis + **BullMQ** for the video/AI worker (autoscaled separately); **Meilisearch** search; **MinIO/R2/S3** storage; **AI provider abstraction** (Claude default, Gemini for cheap high-volume, OpenAI fallback). Multi-tenancy = **shared DB + shared schema + `tenant_id` + Postgres RLS (FORCE)**.

## Top risks (full list: `risk-register.md`)
1. **Cross-tenant data leakage** via RLS/connection-pool misconfig — *Critical*. Mitigation: FORCE RLS + transaction-local `set_config` + `withTenant` sole DB path + CI isolation test.
2. **AI cost bomb** from abuse — *Critical*. Mitigation: credit guard + queue limiter + per-tenant caps + capped free tier.
3. **AI extraction errors** (hallucinated prices/SKUs) — *High*. Mitigation: mandatory human gate (marketed as a feature) + per-field confidence.
4. **Google Content API shutdown 2026-08-18** — build Merchant API v1 only.
5. **Stripe Connect chargeback liability** on the platform — dispute-evidence workflow + reserves.

## Biggest opportunities
AI usage credits (≥75% margin expansion engine) · white-label/agency channel · integrations & theme marketplaces · the data network-effect moat from extraction-accuracy feedback (primary defense if an incumbent copies the feature).

## Where to look next
`vision.md` · `business-model.md` · `platform-roadmap.md` · `tenant-model.md` · `../architecture/system-architecture.md` · `../architecture/module-registry.md` · `../database/schema-design.md` + `prisma/schema.prisma` · `../apis/api-registry.md` · `../ai/ai-agents-spec.md` · `../features/ai-product-extraction/` · `../knowledge/knowledge-graph.md` · live status in `project-dashboard.html`.
