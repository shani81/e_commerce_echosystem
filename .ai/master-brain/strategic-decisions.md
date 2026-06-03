# AICOS — Strategic Decisions

> Authoritative record of the foundational decisions that shape AICOS. The running ledger of smaller, dated decisions lives in `.ai/decisions/decision-log.md`; **this file holds the strategic rationale** (reasoning, alternatives considered, and downstream impact) for the SPEC-level decisions.
> Last updated: 2026-06-03 (PHASE 0, planning).

Conflict rule (governing all of these): **`PROJECT_PROPOSAL.md` controls business scope; `CLAUDE_CODE_BASELINE.md` controls technical standards.** Where the baseline's examples (restaurant-centric) clash with the proposal's e-commerce scope, the proposal wins.

---

## SD-01 — Domain = general e-commerce OS (proposal overrides restaurant baseline)

**Decision.** AICOS is a **general e-commerce operating system for any physical store** (grocery, fashion, electronics, pharmacy, beauty, furniture, automotive, etc.), not a restaurant-specific product. The restaurant examples in the baseline are illustrative only.

**Reasoning.** The proposal explicitly defines an e-commerce platform whose flagship is video-to-catalog extraction for *physical retail inventory*. Restaurant-only scope would discard the proposal's core market. Competitor research shows the real, uncontested opportunity is the ~78% of retail still flowing through physical stores with no online presence — a far larger TAM than restaurant POS/ordering.

**Alternatives considered.**
- *Restaurant-only platform* (follow baseline examples literally) — rejected; contradicts proposal scope and shrinks TAM dramatically.
- *Vertical-specific (e.g., grocery-only)* — rejected; the extraction pipeline and theme engine are designed to be category-agnostic, so narrowing prematurely would waste that generality.

**Impact.** All modules, the six personas, the AI agents, the theme engine (11+ verticals), and revenue streams are framed for **any** physical store. The data model and AI prompts must stay category-agnostic. Vertical packs become a later go-to-market layer, not a code fork.

---

## SD-02 — Backend framework = NestJS

**Decision.** The backend is **NestJS** (Node.js LTS, TypeScript). The video/AI **worker is a separate NestJS application** (`apps/worker`), not a module inside `apps/api`.

**Reasoning.** The proposal specifies NestJS; the baseline left framework unspecified, so the proposal governs. NestJS gives first-class DI, modular boundaries that map cleanly onto the SPEC modules, guards/interceptors ideal for tenant-context and RBAC enforcement, and native BullMQ integration. Splitting the worker lets FFmpeg/AI CPU-heavy workloads scale independently (KEDA on queue depth) from HTTP traffic.

**Alternatives considered.**
- *Plain Express / Fastify* — rejected; less structure for a large modular system, more boilerplate for DI, guards, and queue wiring.
- *Worker as a module inside api* — rejected; couples scaling of HTTP and FFmpeg workloads and risks OOM events taking down the API.

**Impact.** Module-per-bounded-context structure; controllers → services → repositories; guards enforce RBAC + tenant context; `apps/worker` is an independently deployable NestJS service consuming BullMQ.

---

## SD-03 — Search = Meilisearch (over Typesense)

**Decision.** Self-hosted **Meilisearch** is the search engine; the storefront queries it **directly via per-session tenant tokens** (1-hour TTL), bypassing the API in the search hot path.

**Reasoning.** Simpler ops and superior DX; disk-first indexing is cheaper at catalog scale; native multi-language support (Arabic/Thai/CJK product names) matters for the global SMB target; tenant-token isolation lets the frontend search safely without exposing the master key. Far larger/healthier OSS community than Typesense (40.7k vs 16.1k stars).

**Alternatives considered.**
- *Typesense* — rejected; RAM-hourly cloud pricing is less predictable at scale, weaker multilingual story, smaller community. (No query-word limit is its one edge.)
- *Elasticsearch/OpenSearch* — rejected for MVP; heavy ops burden, overkill for SMB catalog sizes.

**Impact.** One less heavy moving part. **Mitigation noted:** Meilisearch has a hard **10-word query limit** — surface to users and split long queries. Master key is never exposed; storefront uses tenant tokens only.

---

## SD-04 — Local storage = MinIO; prod = Cloudflare R2 / AWS S3

**Decision.** S3-compatible storage everywhere: **MinIO** locally, **Cloudflare R2** (preferred) / AWS S3 in prod. Uploads go via **pre-signed URLs**; large videos use **multipart (10 MB parts)** directly client→storage.

**Reasoning.** Same SDK and code path in dev and prod (local/prod parity). R2 eliminates egress fees ($0 vs ~$850/month at 10 TB on S3), is cheaper per-GB, and added EU/US jurisdiction-locked storage (Jan 2026) — a clean GDPR data-residency path. Pre-signed URLs keep large media off the API server.

**Alternatives considered.**
- *Local disk in dev* — rejected; diverges from prod object-storage semantics and breaks pre-signed-URL flows.
- *S3-only in prod* — viable but rejected as default due to egress cost; AICOS serves lots of media. S3 retained as an option behind the same interface.

**Impact.** A single storage abstraction. A **`temp/` R2 prefix with a 48-hour lifecycle rule** is required (FFmpeg produces 300+ frames per 5-min video). Label URLs and other expiring artifacts are cached into our bucket.

---

## SD-05 — Default AI provider = Anthropic Claude, behind a provider-abstraction layer

**Decision.** **Anthropic Claude** is the default model, but **all AI calls go through `packages/ai-core`**, an abstraction over Claude, OpenAI, and Gemini that allows swapping providers **with no code change**. For extraction, **Gemini 2.5 Flash is the high-volume first pass** (~10× cheaper) with **Claude as the low-confidence fallback**.

**Reasoning.** The proposal mandates provider-swappability. Abstraction enables cost routing, resilience (auto-fallback on 429/outage), and protection against frequent model deprecations (Gemini's ~4-month cycle). The tiered Gemini-first/Claude-fallback strategy hits the best cost/accuracy point ($0.10–$0.15 per 5-min video).

**Alternatives considered.**
- *Hard-wire a single provider* — rejected; violates proposal, creates vendor lock-in and a single point of failure.
- *Claude for everything* — rejected on cost; ~10× more expensive than Gemini Flash for the high-volume first pass.

**Impact.** Every `ai-core` call emits an **`ai.usage`** event (provider/model/tokens) consumed by billing for credit deduction — without this, AI cost tracking is impossible. Model IDs are **pinned in config with fallback IDs**. Per-provider rate-limit tracking + exponential backoff + automatic fallback are required.

---

## SD-06 — Multi-tenancy = shared DB + shared schema + `tenant_id` + PostgreSQL RLS

**Decision.** **Shared database, shared schema, `tenant_id` on every row, enforced by PostgreSQL Row-Level Security (FORCE RLS).** Schema-per-tenant is **reserved for large/enterprise tenants later** (P5).

**Reasoning.** Best cost/scale balance for "millions of stores": scales to 100k+ tenants with a single Prisma migration, ~0.4 ms RLS overhead (3.2 → 3.6 ms at 100k rows), and a **database-level isolation guarantee that survives application bugs**. Schema-per-tenant costs more latency (4.8–12.5 ms) and operational complexity at this scale.

**Alternatives considered.**
- *Schema-per-tenant for everyone* — rejected for MVP; migration/ops overhead and latency at 100k+ tenants. Kept as an enterprise upgrade path.
- *Database-per-tenant* — rejected; does not scale to millions of stores operationally or cost-wise.
- *App-layer-only filtering (no RLS)* — rejected; a single missed `WHERE tenant_id` leaks data. RLS is the safety net.

**Impact (and hard implementation rules).**
- **FORCE ROW LEVEL SECURITY on every tenant table** (else the migration owner bypasses RLS silently).
- `set_config(..., TRUE)` (transaction-local) **inside a Prisma `$transaction`**; **never** session-scope — pool reuse would leak tenants.
- **PgBouncer in transaction pooling mode** with `SET LOCAL` (not `SET SESSION`).
- All views: `security_invoker = true`.
- Every tenant model: `@@index([tenantId])` **and** `@@index([tenantId, createdAt])`.
- PostgreSQL **≥ 16.9** (CVE-2024-10978, CVE-2025-8713 RLS fixes).
- A `withTenant` wrapper is the only sanctioned DB access path; enforced architecturally.

---

## SD-07 — Nothing AI-generated publishes automatically (human verification gate)

**Decision.** A **mandatory human verification layer gates publishing.** No AI output — extracted catalogs, generated content, themes, marketing, pricing — ever goes live without explicit human approval. In the pipeline, **catalog-publish (JOB 6) is triggered only by explicit user action**, never automatically after merge.

**Reasoning.** AI extraction errors (hallucinated prices, missed SKUs, wrong variants) are a near-certainty in early deployments (2–5% hallucination rate; ~30% occluded price tags). The gate is both a safety requirement and, per competitor research, a **marketable trust advantage** that directly addresses the adoption concern slowing Shopify Magic / Wix Harmony. It also prevents the catastrophic "wrong products published to wrong store" failure.

**Alternatives considered.**
- *Auto-publish high-confidence items* — rejected; even a small error rate publishing real prices to a live store is unacceptable and erodes trust irreparably.
- *Optional review (default on, can disable)* — rejected for now; the gate is an invariant, not a setting, until accuracy and trust are proven.

**Impact.** A confidence-scored review UI (0–1, per-field) drives triage to minimize owner effort (low-confidence + missing-price items first; merge/split actions). The publish gate is an **architectural invariant** with an automated test asserting JOB 6 cannot fire without explicit user action. Marketing positions the gate as a feature, not a caveat.

---

## Decision interactions (why these reinforce each other)

- **SD-05 + SD-06:** `ai.usage` events + RLS-scoped billing mean AI credit deduction is both accurate **and** tenant-isolated.
- **SD-02 + SD-04 + worker split:** separate `apps/worker` + object storage + pre-signed multipart uploads keep heavy media/AI workloads off the API and independently scalable.
- **SD-03 + SD-06:** Meilisearch **tenant tokens** mirror the DB RLS isolation model at the search layer — the same tenant boundary, enforced in two places.
- **SD-05 + SD-07:** provider fallback keeps extraction available; the human gate keeps it safe. Availability and safety are handled by different mechanisms, by design.
