# Architecture Research Findings: AICOS Enterprise Multi-Tenant SaaS

**Area:** Architecture
**Date:** 2026-06-03
**Project:** AI Commerce OS (AICOS)

---

## Executive Summary

AICOS is a multi-tenant SaaS platform where non-technical store owners upload a short video, AI extracts a full product catalog, and a publishable online store goes live in under 15 minutes. The architecture must support hundreds to tens-of-thousands of tenants on shared infrastructure while processing large video files asynchronously, providing sub-50ms search, and abstracting across three AI providers.

Primary recommendations: commit to **shared-schema + tenant_id + PostgreSQL RLS** now; defer schema-per-tenant to a deliberate enterprise upgrade path; use **Cloudflare R2** as the production storage backend (zero egress fees); keep **Meilisearch self-hosted** (free, sub-50ms, multi-language); build a **provider-interface** abstraction in `packages/ai-core`; process videos through a **five-stage BullMQ pipeline** with deterministic job IDs for idempotency.

---

## 1. pnpm Monorepo Structure

### 1.1 Recommended Layout

```
e_comerce_echosystem/
├── apps/
│   ├── web/           # Next.js storefront (port 3000)
│   ├── admin/         # Next.js admin dashboard (port 3100)
│   ├── api/           # NestJS HTTP API (port 4000)
│   └── worker/        # NestJS BullMQ worker process (port 4100)
├── packages/
│   ├── ui/            # shadcn/ui component library, Tailwind preset
│   ├── config/        # ESLint, Prettier, tsconfig base, Turborepo configs
│   ├── types/         # Shared DTO types, Zod schemas, Prisma client re-exports
│   ├── ai-core/       # AI provider abstraction + prompt templates
│   └── shared/        # Cross-cutting utilities: logger, errors, pagination
├── docker/
│   └── docker-compose.yml
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── .ai/research/specs/
├── pnpm-workspace.yaml
├── turbo.json
└── tsconfig.base.json
```

**Critical design decision:** `apps/worker` is a **separate NestJS application**, not a module inside `apps/api`. This enables independent scaling of HTTP pods vs. worker pods in Kubernetes without coupling resource profiles.

### 1.2 pnpm-workspace.yaml

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

### 1.3 turbo.json Pipeline

```json
{
  "$schema": "https://turbo.build/schema.json",
  "pipeline": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**", ".next/**", "!.next/cache/**"] },
    "dev": { "cache": false, "persistent": true },
    "lint": { "outputs": [] },
    "typecheck": { "dependsOn": ["^build"], "outputs": [] },
    "test": { "dependsOn": ["^build"], "outputs": ["coverage/**"] }
  }
}
```

### 1.4 NestJS Domain Module Boundaries

Each business domain in `apps/api/src/` is a NestJS feature module. Modules never import from sibling modules directly — they communicate via NestJS `EventEmitter2` or BullMQ jobs only.

```
apps/api/src/
├── app.module.ts            # Root: imports all domain modules
├── iam/                     # Identity, Auth, RBAC, multi-tenancy context
├── billing/                 # Stripe subscriptions, plans, credits
├── catalog/                 # Products, variants, categories
├── inventory/               # Stock levels, reservations
├── orders/                  # Order lifecycle, state machine
├── payments/                # Stripe Payment Intents, webhooks
├── shipping/                # Carrier integration (EasyPost/Shippo)
├── customers/               # Customer accounts, addresses
├── storefront/              # Storefront config, public APIs
├── search/                  # Meilisearch sync + query facade
├── media/                   # S3/R2 upload, presigned URLs
├── notifications/           # Email (SendGrid/SMTP) + webhooks
├── ai-extraction/           # Video ingestion + AI catalog extraction
└── content/                 # AI SEO + description generation
```

`apps/worker/src/` mirrors queue consumers only — no HTTP controllers. Worker imports the same domain service classes via shared modules; business logic is not duplicated.

### 1.5 Package Responsibilities

| Package | Owns | Must NOT own |
|---|---|---|
| `packages/types` | Zod schemas, DTO interfaces, Prisma re-exports, enums | Business logic, DB queries |
| `packages/ai-core` | Provider interface, prompt templates, token counting | HTTP controllers, queue processors |
| `packages/shared` | Logger (Pino), custom exceptions, pagination helpers | Framework-specific (NestJS/React) |
| `packages/ui` | shadcn components, Tailwind theme, design tokens | API calls, server state |
| `packages/config` | tsconfig.base, eslint.base, prettier | Runtime code |

References: [NestJS monorepo with pnpm workspaces](https://gabrielcaiana.com/blog/nestjs-monorepo-with-pnpm-workspaces-how-i-structured-the-dev-experience-for-multiple-services/)

---

## 2. Multi-Tenancy Isolation Strategy

### 2.1 Three Strategies Compared

| Dimension | Shared Schema + RLS | Schema-per-Tenant | Database-per-Tenant |
|---|---|---|---|
| **Isolation level** | Row-level (DB enforced) | Schema boundary | Full DB process isolation |
| **Migration complexity** | Single migration | Run per tenant schema | Run per tenant DB |
| **Tenant onboarding** | INSERT + set policy | CREATE SCHEMA + migrate | CREATE DATABASE + provision |
| **Operational overhead** | Very low | Medium | High |
| **Max practical tenants** | 100k+ | ~500 | ~50 |
| **Cross-tenant reporting** | Trivial (super-admin query) | Requires UNION/FDW | Requires ETL |
| **RLS latency overhead** | ~0.4 ms (3.2ms to 3.6ms at 100k rows) | 4.8-12.5 ms | Varies |

Benchmark (2025, 100k rows / 1,000 tenants): Shared Schema no RLS = 3.2 ms, with RLS = 3.6 ms, Schema-per-Tenant = 4.8-12.5 ms. ([dasroot.net 2026](https://dasroot.net/posts/2026/01/multi-tenancy-database-patterns-schema-database-row-level/))

### 2.2 Decision: Shared Schema + tenant_id + PostgreSQL RLS

Rationale for AICOS:
- AICOS targets thousands of small/medium store owners. Per-tenant cost must be near zero.
- A single Prisma migration covers all tenants simultaneously.
- RLS provides a database-level hard guarantee: even a buggy query cannot return cross-tenant rows.
- Schema-per-tenant is reserved as an **explicit upgrade path** for enterprise/white-label tenants requiring DDL isolation.

### 2.3 Implementation Patterns

#### Prisma Schema Convention

```prisma
model Product {
  id         String   @id @default(cuid())
  tenantId   String   @db.Uuid
  tenant     Tenant   @relation(fields: [tenantId], references: [id])
  @@index([tenantId])
  @@index([tenantId, createdAt])
}
```

#### PostgreSQL RLS Policies

```sql
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_products ON products
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', TRUE), '')::uuid);

CREATE POLICY super_admin_bypass ON products
  TO aicos_superadmin USING (TRUE);
```

#### NestJS Middleware — SET LOCAL (not SET SESSION)

```typescript
@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  async use(req: Request, res: Response, next: NextFunction) {
    const tenantId = this.resolveTenantId(req);
    if (!tenantId) throw new UnauthorizedException('No tenant context');
    // SET LOCAL: transaction-scoped; resets when transaction ends
    // NEVER use SET (session-scoped) — leaks across pooled connections
    await this.prisma.$executeRawUnsafe(`SET LOCAL app.current_tenant = '${tenantId}'`);
    AsyncLocalStorage.getStore()?.set('tenantId', tenantId);
    next();
  }
}
```

#### Critical: Views Must Use security_invoker

```sql
-- Without this, views execute with owner privileges and bypass RLS
ALTER VIEW product_summaries SET (security_invoker = true);
```

#### Superadmin Bypass

Platform super-admin connects as `aicos_superadmin` role (BYPASSRLS). Regular application connections use `aicos_app` role (no BYPASSRLS).

### 2.4 Schema-per-Tenant Upgrade Path (Enterprise)

1. `CREATE SCHEMA tenant_{id}` with a dedicated migration run.
2. JWT carries `tenancy_mode: 'schema'` claim.
3. IAM middleware routes via `search_path` instead of setting the RLS variable.
4. Application code is identical — only DB connection bootstrap differs.

References:
- [AWS Blog: Multi-tenant data isolation with PostgreSQL RLS](https://aws.amazon.com/blogs/database/multi-tenant-data-isolation-with-postgresql-row-level-security/)
- [Mastering PostgreSQL RLS (ricofritzsche.me)](https://ricofritzsche.me/mastering-postgresql-row-level-security-rls-for-rock-solid-multi-tenancy/)
- [Crunchy Data: RLS for Tenants](https://www.crunchydata.com/blog/row-level-security-for-tenants-in-postgres)

---

## 3. AI Provider Abstraction Layer

### 3.1 Design Goal

Swap the underlying AI provider (Anthropic Claude, OpenAI, Google Gemini) with zero changes to callers. All AI features go through one interface in `packages/ai-core`.

### 3.2 Core Interface

```typescript
export interface CompletionRequest {
  model?: string;
  systemPrompt?: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'text' | 'json_object';
  tools?: ToolDefinition[];
}

export interface CompletionResponse {
  content: string;
  toolCalls?: ToolCall[];
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  provider: 'anthropic' | 'openai' | 'gemini';
  model: string;
  latencyMs: number;
}

export interface AIProvider {
  readonly name: 'anthropic' | 'openai' | 'gemini';
  complete(req: CompletionRequest): Promise<CompletionResponse>;
  embedText?(text: string): Promise<number[]>;
  analyzeVideo?(videoUrl: string, prompt: string): Promise<string>;
}
```

### 3.3 Provider Registry and Fallback

Default provider chain: **Claude (claude-opus-4-5)** → GPT-4o → Gemini 1.5 Pro.

```typescript
@Injectable()
export class AIService {
  async complete(req: CompletionRequest, options?: { preferredProvider?: ProviderName; fallback?: boolean }): Promise<CompletionResponse> {
    const provider = this.registry.resolve(options?.preferredProvider ?? this.config.defaultProvider); // 'anthropic'
    try { return await provider.complete(req); }
    catch (err) {
      if (options?.fallback) return this.registry.completeFallback(req);
      throw err;
    }
  }
}
```

### 3.4 Current Model IDs (June 2026)

| Provider | Default Model | Notes |
|---|---|---|
| Anthropic | claude-opus-4-5 | Best reasoning for catalog extraction |
| OpenAI | gpt-4o | Strong fallback; good vision support |
| Google | gemini-1.5-pro | Preferred for long video analysis (2M context window) |

### 3.5 Token Cost Tracking

```typescript
this.eventEmitter.emit('ai.usage', {
  tenantId, provider, model, promptTokens, completionTokens, feature: 'extraction'
});
```

Billing module subscribes to this event to deduct AI credits from the tenant balance.

### 3.6 Prompt Template Versioning

Store prompts in `packages/ai-core/src/prompts/` as versioned TypeScript — not inline strings. This makes prompt A/B testing, auditing, and rollback tractable.

References:
- [Tool-Agnostic AI Stack (MindStudio)](https://www.mindstudio.ai/blog/tool-agnostic-ai-agent-stack-model-wars)
- [AI Agent Platform Architecture 2026](https://www.knowlee.ai/blog/ai-agent-platform-architecture-2026)

---

## 4. Background Video Processing Pipeline

### 4.1 Five-Stage BullMQ Pipeline

```
[Client uploads directly to R2 via multipart presigned URLs]
    |
JOB 1: video-validate
  - Verify checksum, MIME type, codec, duration limits
  - ExtractionJob.status → 'validating'
    |
JOB 2: video-segment
  - FFmpeg: split into 10-second segments
  - Extract 1 frame/second → JPEG to R2 temp/ prefix
  - Spawn N child jobs via flowProducer.addBulk()
    |
JOB 3: ai-analyze-frames (N parallel children)
  - Send frame batch to AI vision
  - Write raw output to extraction_segments table
    |
JOB 4: catalog-merge
  - Deduplicate products; resolve price conflicts
  - Create draft Product records status='ai_draft'
    |
JOB 5: human-verification-notify
  - Notify owner: catalog ready for review
  - ExtractionJob.status → 'awaiting_review'
    |
[Owner reviews in admin UI, clicks Publish — REQUIRED]
    |
JOB 6: catalog-publish (user-triggered only)
  - Promote 'ai_draft' → 'active'
  - Sync to Meilisearch
```

**The human gate before publish is non-negotiable** — no AI output goes live without owner confirmation.

### 4.2 Idempotency via Deterministic Job IDs

| Job | ID Pattern | Deduplication Meaning |
|---|---|---|
| video-validate | `validate:{tenantId}:{s3ETag}` | Same file re-uploaded -> skip |
| video-segment | `segment:{extractionJobId}` | Retry-safe |
| ai-analyze-frames | `analyze:{extractionJobId}:seg{n}` | Per-segment retry |
| catalog-merge | `merge:{extractionJobId}` | Single merge per job |
| catalog-publish | `publish:{tenantId}:{extractionJobId}` | Idempotent publish |

```typescript
await videoQueue.add('video-validate', payload, {
  jobId: `validate:${tenantId}:${s3ETag}`,
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: { age: 86400 },
  removeOnFail: { age: 86400 * 7 },
});
```

If the same `jobId` already exists, BullMQ silently ignores the add — built-in deduplication, no extra Redis management.

### 4.3 Client-Side Multipart Upload (Never Buffer on API)

```
Client → POST /api/media/initiate-upload  → { uploadId, presignedUrls[] }
Client → PUT  each 10 MB chunk → R2 directly  (API not in hot path)
Client → POST /api/media/complete-upload  → API calls CompleteMultipartUpload
API    → emits video.uploaded → BullMQ pipeline starts
```

A 500 MB video = 50 chunks at 10 MB each. R2 uses the identical AWS S3 multipart API.

### 4.4 Queue and Worker Configuration

```typescript
@Processor('video-processing', { concurrency: 2 })  // CPU-bound FFmpeg
export class VideoWorker extends WorkerHost {}

@Processor('ai-analysis', { concurrency: 10 })      // IO-bound AI API calls
export class AIAnalysisWorker extends WorkerHost {}
```

FFmpeg Docker image: `FROM node:22-slim` + `apt-get install -y ffmpeg`.

```bash
# Split into 10-second segments
ffmpeg -i input.mp4 -c copy -map 0 -segment_time 10 -f segment -reset_timestamps 1 seg%03d.mp4
# Extract 1 fps frames
ffmpeg -i segment_002.mp4 -vf fps=1 -q:v 3 frames/seg002_%04d.jpg
```

References:
- [BullMQ Idempotent Jobs](https://docs.bullmq.io/patterns/idempotent-jobs)
- [BullMQ Deduplication](https://docs.bullmq.io/guide/jobs/deduplication)
- [NestJS Queues Documentation](https://docs.nestjs.com/techniques/queues)

---

## 5. Search: Meilisearch vs Typesense

### 5.1 Feature Comparison (June 2026)

| Feature | Meilisearch | Typesense |
|---|---|---|
| **Indexing storage** | Disk (memory-mapped) | Entirely in RAM |
| **Language support** | Latin, CJK, Arabic, Thai, Korean auto-detect | Unicode only; poor non-Latin |
| **Field weighting** | Custom ranking rules (native weighting in dev) | Yes, at query time |
| **Semantic search** | Built-in with embedding generation | Available |
| **Multi-tenancy** | Tenant tokens (scoped JWTs with embedded filters) | Collection-level API keys |
| **Self-hosted cost** | Free, unlimited documents | Free, unlimited documents |
| **Cloud pricing** | $30/mo Build (1M docs, 50k searches/mo) | RAM hourly ~$21.60/mo+, unpredictable |
| **GitHub stars (June 2026)** | 40.7k | 16.1k |
| **Query word limit** | 10 (hard limit) | Unlimited |

### 5.2 Decision: Meilisearch (Confirmed)

Decisive factors for AICOS:

1. **Multi-language product names.** Arabic, Thai, Chinese, Japanese labels in store owner videos. Meilisearch handles these natively; Typesense fails on non-Latin scripts.
2. **Disk-first indexing.** Millions of SKUs across tenants. Meilisearch handles this on a modest server; Typesense needs expensive RAM provisioning proportional to catalog size.
3. **Predictable self-hosted cost.** ~$20-40/mo VM with no per-search metering ever.
4. **Tenant token isolation.** Scoped JWTs with embedded `tenantId = "xxx"` filter prevent cross-tenant leakage.
5. **Community momentum.** 2.5x more stars, 3.7x more contributors than Typesense (June 2026).

### 5.3 Tenant Token Pattern

```typescript
// API generates short-lived token; frontend queries Meilisearch directly
const tenantToken = await meilisearch.generateTenantToken(
  'search-api-key-uid',
  [{ indexesPattern: 'products', filter: `tenantId = "${tenantId}"` }],
  { expiresAt: new Date(Date.now() + 3_600_000) }
);
```

### 5.4 AICOS Index Design

```typescript
const PRODUCTS_INDEX_SETTINGS = {
  primaryKey: 'id',
  searchableAttributes: ['name', 'description', 'sku', 'tags', 'categoryName'],
  filterableAttributes: ['tenantId', 'categoryId', 'status', 'inStock'],
  sortableAttributes: ['price', 'createdAt', 'name', 'salesRank'],
  rankingRules: ['words', 'typo', 'proximity', 'attribute', 'sort', 'exactness'],
};
```

References:
- [Meilisearch vs Typesense Official](https://www.meilisearch.com/blog/meilisearch-vs-typesense)
- [Typesense vs Meilisearch 2026 (Toolradar)](https://toolradar.com/compare/typesense-vs-meilisearch)
- [Meilisearch Cloud Pricing](https://www.meilisearch.com/pricing)

---

## 6. Media Storage: S3/R2 Strategy

### 6.1 Pricing Comparison (June 2026)

| Cost Factor | Cloudflare R2 | AWS S3 Standard (US-East) |
|---|---|---|
| **Storage** | $0.015/GB/month | $0.023/GB/month |
| **Egress to internet** | **$0.00 (always free)** | $0.085/GB after first 10 TB |
| **Class A ops** (PUT/POST) | $4.50/million | $5.00/million |
| **Class B ops** (GET) | $0.36/million | $0.40/million |
| **Permanent free tier** | 10 GB, 1M Class A, 10M Class B/month | None (12-month trial only) |
| **Egress at 10 TB/month** | **$0** | ~$850/month |
| **Jurisdiction locking** | EU and US (added Jan 2026) | Available (S3 Object Lock) |

For AICOS (product images + video processing frames), egress is the dominant cost. R2 eliminates it entirely.

**Example math:** 10,000 video uploads/month at 1 fps = 3 million JPEG frames served to review UI. S3 egress: ~$25/month for frames alone. R2: $0.

### 6.2 When AWS S3 Still Wins

| Use Case | Use S3 When |
|---|---|
| Lambda/SNS event triggers on object creation | S3 native integration |
| >50 complex lifecycle policy rules | S3 has richer lifecycle engine |
| HIPAA / FedRAMP compliance | S3 with compliance configs |
| Multi-region active-active replication | S3 (R2 replication is unidirectional) |

AICOS verdict: R2 as primary production store. S3 SDK abstraction means switching is a single env var change.

### 6.3 Storage Interface (packages/shared)

```typescript
export interface StorageService {
  getPresignedUploadUrl(key: string, contentType: string, expiresIn?: number): Promise<string>;
  getPresignedDownloadUrl(key: string, expiresIn?: number): Promise<string>;
  deleteObject(key: string): Promise<void>;
  initiateMultipartUpload(key: string, contentType: string): Promise<{ uploadId: string }>;
  getPresignedPartUrl(key: string, uploadId: string, partNumber: number): Promise<string>;
  completeMultipartUpload(key: string, uploadId: string, parts: CompletedPart[]): Promise<string>;
}
```

`S3StorageService` implements this using `@aws-sdk/client-s3`. The same implementation works with MinIO (dev), R2 (prod), and S3 — only the `endpoint`, `forcePathStyle`, and credentials differ via environment config.

### 6.4 S3 Key Naming Convention

```
tenants/{tenantId}/products/{productId}/images/{imageId}.{ext}
tenants/{tenantId}/videos/uploads/{extractionJobId}/original.{ext}
tenants/{tenantId}/videos/{extractionJobId}/segments/seg{n}.mp4
tenants/{tenantId}/videos/{extractionJobId}/frames/seg{n}/{frame}.jpg
temp/{tenantId}/{jobId}/           # Lifecycle rule: auto-delete after 48h
platform/themes/{themeId}/         # Non-tenant platform assets
```

References:
- [Cloudflare R2 vs AWS S3](https://www.cloudflare.com/pg-cloudflare-r2-vs-aws-s3/)
- [Cloud Storage Pricing 2026 (LeanOps)](https://leanopstech.com/blog/cloud-storage-pricing-comparison-2026/)
- [R2 vs S3 Decision Framework 2026](https://leanopstech.com/blog/cloudflare-r2-vs-aws-s3-decision-framework-2026/)

---

## 7. Horizontal Scaling

### 7.1 Stateless API Requirements

| State Type | Solution |
|---|---|
| Session / JWT | Stateless JWT (RS256); refresh tokens in Redis |
| BullMQ job state | Redis (external, shared across pods) |
| File uploads | Direct-to-R2/S3 presigned URLs; never buffer on API pod |
| WebSocket / SSE | Redis pub/sub adapter (socket.io-redis) |
| Caches | Redis (rate limiting, tenant config) |
| Tenant RLS context | AsyncLocalStorage (per-request, cleared on request end) |

### 7.2 Kubernetes Deployment Topology

```yaml
# Separate Deployments for independent scaling
aicos-api:             # HTTP API, 2-20 replicas, CPU/RPS HPA
aicos-worker-video:    # FFmpeg/segment, 1-5 replicas, KEDA queue-depth HPA
aicos-worker-ai:       # AI analysis, 2-10 replicas, KEDA queue-depth HPA
aicos-worker-misc:     # Notifications/search sync, 1-3 replicas

# Managed Services
PostgreSQL 16:  RDS / CloudSQL / Neon + read replica
Redis:          ElastiCache / Upstash cluster mode
Meilisearch:    StatefulSet + persistent volume (self-managed)
Cloudflare R2:  External (no cluster involvement)
```

### 7.3 KEDA for Worker Autoscaling

Standard CPU-based HPA is wrong for BullMQ workers. Queue depth drives need. Use KEDA (https://keda.sh/):

```yaml
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
spec:
  scaleTargetRef:
    name: aicos-worker-video
  minReplicaCount: 1
  maxReplicaCount: 5
  triggers:
    - type: redis
      metadata:
        listName: bull:video-processing:wait
        listLength: "3"  # scale up when >3 jobs per replica
```

### 7.4 PgBouncer + RLS Compatibility

Use PgBouncer in **transaction pooling mode**:
```
API Pods → PgBouncer (transaction mode) → PostgreSQL
           max_client_conn: 1000 / default_pool_size: 20
```

Transaction mode is compatible with `SET LOCAL app.current_tenant` because the variable scopes to the transaction. Using `SET SESSION` instead would leak tenant context across reused connections — this is the highest-risk misconfiguration in this stack.

### 7.5 Zero-Downtime Deployment

```yaml
strategy:
  type: RollingUpdate
  rollingUpdate: { maxUnavailable: 0, maxSurge: 1 }
```

Prisma migrations run as a Kubernetes Job in the pre-deploy step, never inside the app startup sequence.

References:
- [Horizontal Scaling NestJS in Kubernetes](https://medium.com/@hadiyolworld007/horizontal-scaling-nestjs-in-kubernetes-without-memory-leaks-f6c9bcd5578b)
- [NestJS in Production: Kubernetes Pitfalls](https://dev.to/francotel/nestjs-in-production-20-default-configurations-that-can-break-your-kubernetes-cluster-a-devops-3d2g)

---

## 8. Consolidated Decisions Table

| Decision | Choice | Rationale |
|---|---|---|
| Monorepo tooling | pnpm workspaces + Turborepo | Symlinks for DX; parallel builds + remote cache |
| Multi-tenancy | Shared schema + tenant_id + PostgreSQL RLS | Scales to 100k+ tenants; single migration; DB-level guarantee |
| Enterprise upgrade path | Schema-per-tenant on demand | JWT claim switches mode; app code unchanged |
| RLS session variable | SET LOCAL app.current_tenant | Transaction-scoped; no pool leakage |
| AI default provider | Anthropic Claude (claude-opus-4-5) | Best reasoning for catalog extraction |
| AI fallback chain | Claude → GPT-4o → Gemini 1.5 Pro | Gemini preferred for long video analysis |
| AI abstraction | packages/ai-core NestJS DI | No third-party gateway; full cost tracking control |
| Video pipeline | 5-stage BullMQ Flow | Each stage independently retryable; deterministic job IDs |
| Video upload | Client-side multipart presigned to R2 | 10 MB chunks; API not in upload hot path |
| Search engine | Meilisearch self-hosted | Free at scale; disk-first; native multi-language |
| Search isolation | Meilisearch tenant tokens | Frontend queries Meilisearch directly with scoped JWT |
| Local storage | MinIO | S3-compatible; zero external dependency in dev |
| Production storage | Cloudflare R2 | Zero egress fees; GDPR jurisdiction locking; S3 API compatible |
| API scaling | CPU/RPS HPA | Standard horizontal scaling |
| Worker scaling | KEDA queue-depth HPA | Correct metric for queue consumers |
| Connection pooling | PgBouncer transaction mode | Compatible with SET LOCAL; caps DB connections |

---

## 9. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| RLS bypass via SECURITY DEFINER function or superuser view | Medium | Critical | All views use security_invoker=true; automated cross-tenant tests in CI |
| PgBouncer session leakage if SET SESSION used instead of SET LOCAL | High if misconfigured | Critical | Enforce SET LOCAL in Prisma middleware; integration test per-request isolation |
| BullMQ job starvation under high video load | Medium | High | KEDA autoscaling; separate queues for video vs AI |
| AI provider outage (Anthropic down) | Low | High | Fallback chain to GPT-4o, then Gemini |
| Meilisearch disk full (large catalogs) | Low | Medium | Monitor disk; provision 3x expected; alert at 70% |
| R2 eventual consistency on new uploads | Low | Low | Enqueue BullMQ job only after CompleteMultipartUpload HTTP 200 |
| Meilisearch tenant token expired mid-search | Medium | Low | 1-hour expiry; generate fresh token on 401 |
| FFmpeg memory spike on 4K video | Medium | Medium | Enforce max resolution at upload validation; concurrency: 2/pod |
| Cross-tenant data leak in AI extraction output | Low | Critical | Human verification gate — owner must approve before publish |
| Prisma migration failure mid-deploy | Low | High | Always run migrations as pre-deploy K8s Job, not at app startup |

---

## 10. Implementation Priority by Phase

### Phase 0 (Foundation)

1. pnpm workspace scaffold with Turborepo and all five packages
2. PostgreSQL schema with tenantId on all tenant-scoped tables
3. RLS policies created in Prisma migrations via `$executeRaw`
4. TenantContextMiddleware with `SET LOCAL` + PrismaService integration
5. `packages/ai-core` interface with AnthropicProvider implementation only
6. StorageService abstraction wired to MinIO in docker-compose
7. BullMQ queue definitions and base worker structure in `apps/worker`

### Phase 1 (Core Commerce)

1. All domain modules use tenant context automatically via global middleware
2. Meilisearch in docker-compose; search-sync BullMQ consumer per domain
3. R2 bucket created; StorageService env var switches to R2 endpoint in prod
4. PgBouncer deployed in front of PostgreSQL in production

### Phase 2 (AI Extraction — Flagship)

1. Multipart presigned upload endpoint with R2/MinIO
2. Five-stage BullMQ pipeline (validate → segment → analyze → merge → notify)
3. FFmpeg worker Docker image with separate K8s Deployment
4. Full AIService with provider registry, fallback, and token tracking
5. Human verification review UI in admin dashboard
6. KEDA ScaledObjects for video and AI worker autoscaling

---

## Sources

- [AWS Blog: Multi-tenant data isolation with PostgreSQL RLS](https://aws.amazon.com/blogs/database/multi-tenant-data-isolation-with-postgresql-row-level-security/)
- [Mastering PostgreSQL RLS for Multi-Tenancy](https://ricofritzsche.me/mastering-postgresql-row-level-security-rls-for-rock-solid-multi-tenancy/)
- [Crunchy Data: Row Level Security for Tenants](https://www.crunchydata.com/blog/row-level-security-for-tenants-in-postgres)
- [Multi-Tenancy Database Patterns 2026 (dasroot.net)](https://dasroot.net/posts/2026/01/multi-tenancy-database-patterns-schema-database-row-level/)
- [Meilisearch vs Typesense Official](https://www.meilisearch.com/blog/meilisearch-vs-typesense)
- [Typesense vs Meilisearch 2026 (Toolradar)](https://toolradar.com/compare/typesense-vs-meilisearch)
- [Meilisearch Cloud Pricing](https://www.meilisearch.com/pricing)
- [Cloudflare R2 vs AWS S3](https://www.cloudflare.com/pg-cloudflare-r2-vs-aws-s3/)
- [Cloud Storage Pricing 2026 (LeanOps)](https://leanopstech.com/blog/cloud-storage-pricing-comparison-2026/)
- [R2 vs S3 Decision Framework 2026](https://leanopstech.com/blog/cloudflare-r2-vs-aws-s3-decision-framework-2026/)
- [BullMQ Idempotent Jobs](https://docs.bullmq.io/patterns/idempotent-jobs)
- [BullMQ Deduplication](https://docs.bullmq.io/guide/jobs/deduplication)
- [NestJS Queues Documentation](https://docs.nestjs.com/techniques/queues)
- [Scalable Video Pipeline NestJS + BullMQ](https://medium.com/@mumerbilal142/building-a-scalable-video-scraper-pipeline-using-nestjs-bullmq-puppeteer-redis-mongodb-s3-4ab4bf9056a0)
- [Efficient S3 Uploads in NestJS](https://dev.to/adamthedeveloper/efficient-s3-file-uploads-speed-large-file-handling-in-nestjs-31a4)
- [Horizontal Scaling NestJS in Kubernetes](https://medium.com/@hadiyolworld007/horizontal-scaling-nestjs-in-kubernetes-without-memory-leaks-f6c9bcd5578b)
- [NestJS in Production: Kubernetes Pitfalls](https://dev.to/francotel/nestjs-in-production-20-default-configurations-that-can-break-your-kubernetes-cluster-a-devops-3d2g)
- [NestJS monorepo with pnpm workspaces](https://gabrielcaiana.com/blog/nestjs-monorepo-with-pnpm-workspaces-how-i-structured-the-dev-experience-for-multiple-services/)
- [Tool-Agnostic AI Agent Stack (MindStudio)](https://www.mindstudio.ai/blog/tool-agnostic-ai-agent-stack-model-wars)
- [Multi-tenant App with NestJS](https://arnab-k.medium.com/building-a-multi-tenant-application-with-nestjs-d2229eacc131)