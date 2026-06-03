# AICOS Security & Compliance Findings

**Area:** Security & Compliance — Multi-Tenant Commerce SaaS
**Date:** 2026-06-03
**Stack:** NestJS API · Next.js App Router · PostgreSQL 16 + Prisma ORM · Redis + BullMQ · Stripe · S3-compatible storage (MinIO / Cloudflare R2 / AWS S3) · AI abstraction layer (Anthropic Claude, OpenAI, Gemini)

---

## Table of Contents

1. [Tenant Data Isolation — RLS Architecture and Pitfalls](#1-tenant-data-isolation)
2. [Authentication and Authorization — AuthN/Z and RBAC](#2-authnz-and-rbac)
3. [PCI DSS Scope with Stripe](#3-pci-dss-scope-with-stripe)
4. [GDPR Compliance](#4-gdpr-compliance)
5. [Secrets Management](#5-secrets-management)
6. [Rate Limiting and Abuse Prevention](#6-rate-limiting-and-abuse-prevention)
7. [Audit Logging](#7-audit-logging)
8. [Web Security — XSS, CSRF, SQLi](#8-web-security)
9. [Webhook Signature Verification](#9-webhook-signature-verification)
10. [Prioritized Control Checklist](#10-prioritized-control-checklist)

---

## 1. Tenant Data Isolation

### Architecture Decision

AICOS uses **shared database, shared schema** with `tenant_id` on every row plus PostgreSQL Row-Level Security (RLS). Schema-per-tenant is reserved for large/enterprise tenants in P5. This minimizes ops overhead and migration complexity while providing acceptable isolation when RLS is configured correctly.

### Enabling RLS Correctly

Every tenant-scoped table requires both directives:

```sql
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE products FORCE ROW LEVEL SECURITY;  -- CRITICAL: applies to table owner too

CREATE POLICY tenant_isolation ON products
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

`FORCE ROW LEVEL SECURITY` is non-negotiable. Without it, the PostgreSQL table owner (the migration user) bypasses all policies silently. Apply both directives to every table in the schema that contains tenant data.

Source: https://aws.amazon.com/blogs/database/multi-tenant-data-isolation-with-postgresql-row-level-security/

### Prisma + Connection Pool: The Critical Problem

Prisma maintains an internal connection pool. Session variables set with `SET` or `set_config` are scoped to the connection, not the request. When a connection is reused from the pool, the previous tenant's `app.current_tenant_id` may still be active, causing **cross-tenant data leakage**.

Source: https://github.com/prisma/prisma/issues/5128

**Correct pattern — use `$transaction` with transaction-local `set_config(TRUE)`:**

```typescript
// apps/api/src/common/prisma/tenant-prisma.service.ts
async withTenant<T>(tenantId: string, fn: (tx: PrismaClient) => Promise<T>): Promise<T> {
  return this.prisma.$transaction(async (tx) => {
    // TRUE = transaction-local: auto-resets when transaction ends
    await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, TRUE)`;
    return fn(tx as unknown as PrismaClient);
  });
}
```

The third argument `TRUE` makes the setting reset automatically when the transaction commits or rolls back. The connection returns to the pool with no tenant context. **Never use `set_config(..., FALSE)` (session scope) in pooled environments.**

Source: https://js.elitedev.in/js/build-multi-tenant-saas-with-nestjs-prisma-postgresql-complete-rls-implementation-guide-c377189c/

### Known CVEs (as of 2026-06)

| CVE | Description | Fix |
|-----|-------------|-----|
| CVE-2024-10978 | RLS policies on subquery tables could disregard mid-query user ID changes | Upgrade to PostgreSQL 16.5+ / 17.1+ |
| CVE-2025-8713 | Optimizer statistics could leak sampled rows from RLS-protected tables | Upgrade to PostgreSQL 16.9+ / 17.5+ (patch May 2025) |

**Action:** Pin the Docker base image to the latest patch. Verify with `SELECT version();` in CI.

### Superuser and BYPASSRLS

Superusers always bypass RLS. Never use superuser credentials in the application connection string.

```sql
CREATE ROLE aicos_app LOGIN PASSWORD '...';
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO aicos_app;
-- Do NOT grant BYPASSRLS to aicos_app
```

Maintain a separate admin role with BYPASSRLS only for migrations and super-admin operations, accessed via a separate connection string stored in Vault/Secrets Manager.

Source: https://www.permit.io/blog/postgres-rls-implementation-guide

### View Ownership Trap

Views created by a superuser run with superuser privileges by default, bypassing RLS:

```sql
-- SAFE: security_invoker forces view to run as the calling role
CREATE VIEW tenant_products WITH (security_invoker = true) AS
  SELECT * FROM products;
```

Source: https://medium.com/@instatunnel/multi-tenant-leakage-when-row-level-security-fails-in-saas-da25f40c788c

### Performance: Composite Indexes Are Mandatory

Without `tenant_id` as the leading column, RLS performs a full-table scan before filtering — two orders of magnitude slower. This is the #1 RLS performance killer in production.

```sql
CREATE INDEX idx_products_tenant       ON products      (tenant_id, id);
CREATE INDEX idx_orders_tenant_status  ON orders        (tenant_id, status, created_at DESC);
CREATE INDEX idx_items_tenant_sku      ON catalog_items (tenant_id, sku);
-- Required on EVERY tenant-scoped table
```

Source: https://www.simplyblock.io/blog/underated-postgres-multi-tenancy-with-row-level-security/

### PgBouncer Configuration

If PgBouncer is added for K8s connection scaling, use **session pooling** mode. In transaction pooling mode, `set_config` may land on a different backend connection than subsequent queries. If transaction pooling is required, configure `server_reset_query = DISCARD ALL`. AICOS's `withTenant` pattern mitigates this risk regardless.

### Meilisearch Tenant Tokens

Every storefront search request must use a per-tenant **tenant token** (short-lived JWT with embedded filter), never the master API key:

```typescript
const tenantToken = client.generateTenantToken(
  searchApiKeyUid,
  { filter: `tenant_id = "${tenantId}"` },
  { expiresAt: new Date(Date.now() + 3_600_000) } // 1-hour TTL
);
```

Meilisearch enforces the embedded filter server-side, preventing cross-tenant product queries.

---

## 2. AuthN/Z and RBAC

### JWT Architecture

Use **short-lived access tokens (15 min) + long-lived refresh tokens (7 days, httpOnly cookie)**. Store refresh tokens in a Redis **allowlist** (not denylist) — instant revocation by deleting a single Redis key.

```
Access Token:  JWT, RS256, 15-minute expiry, payload: { sub, tenantId, role, scopes[] }
Refresh Token: opaque UUID in Redis: auth:refresh:{userId}:{deviceId}, TTL 7 days
Cookie flags:  HttpOnly; Secure; SameSite=Strict; Path=/api/auth/refresh
```

Never store tokens in `localStorage` — XSS exfiltrates them trivially. HttpOnly cookies are inaccessible to JavaScript.

Source: https://medium.com/@sabin.shrestha.er/stop-rebuilding-auth-a-production-ready-jwt-rbac-template-for-nestjs-18d99f9b8944

### RBAC Role Hierarchy

| Role | Scope | Key Permissions |
|------|-------|-----------------|
| `platform_super_admin` | Cross-tenant | Full system access, tenant management, billing overrides |
| `tenant_owner` | Own tenant | All resources, billing, staff management |
| `tenant_manager` | Own tenant | Catalog, orders, inventory, reports; no billing/settings |
| `tenant_staff` | Own tenant | Order processing, inventory updates, customer service |
| `end_customer` | Own data | Own profile, orders, wishlist |

Agency/reseller role: can manage sub-tenant settings but cannot access sub-tenant transactional data.

### NestJS Guard with Tenant Context Check

```typescript
// packages/shared/src/auth/guards/tenant-rbac.guard.ts
@Injectable()
export class TenantRbacGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[]>('roles', [
      context.getHandler(), context.getClass(),
    ]);
    const { user, params } = context.switchToHttp().getRequest();
    // Validate BOTH role AND tenantId — application-layer defense in depth on top of RLS
    if (user.tenantId !== params.tenantId && user.role !== 'platform_super_admin') {
      throw new ForbiddenException('Cross-tenant access denied');
    }
    return required.some(r => user.role === r || isRoleAbove(user.role, r));
  }
}
```

The tenant-context check prevents a valid token for tenant A from accessing tenant B's resources even if the role matches.

Source: https://docs.logto.io/api-protection/nodejs/nestjs

### Password and Session Policy (2025 Baseline)

- Minimum 12 characters; Bcrypt cost factor **12**
- HaveIBeenPwned k-anonymity breach check on registration and password change
- Account lockout: 5 failed attempts → 15-minute lockout, tracked in Redis
- MFA: TOTP via `otplib`; **mandatory for `tenant_owner` and above at P1**; Passkey/WebAuthn at P3
- Concurrent session limit: configurable per plan (Starter: 3, Pro: unlimited)
- "Sign out all devices": `DEL auth:refresh:{userId}:*` in Redis

---

## 3. PCI DSS Scope with Stripe

### AICOS PCI Posture

AICOS does not handle raw card data. The integration uses **Stripe Elements** (embedded iframe) or **Stripe Checkout** (hosted page). Card data flows directly from the browser to Stripe's PCI Level 1-certified servers — AICOS's API never sees a PAN, CVV, or track data.

This qualifies AICOS and its tenants for **SAQ A** — approximately 22 controls vs. 300+ for SAQ D.

Source: https://stripe.com/resources/more/pci-dss-checklist-for-businesses

### Safe Data to Store

| Field | Safe? | Notes |
|-------|-------|-------|
| Card brand (visa, mastercard, etc.) | Yes | Display only |
| Last 4 digits | Yes | Display only |
| Expiration month/year | Yes | |
| Stripe PaymentMethod ID | Yes | Token, not actual card data |
| Stripe Customer / Subscription / PaymentIntent IDs | Yes | |
| Full card number | **NEVER** | PCI violation |
| CVV / CVC | **NEVER** | PCI violation |
| Track data | **NEVER** | PCI violation |

Never log raw Stripe webhook payloads.

Source: https://docs.stripe.com/security/guide

### PCI DSS v4.0 Changes (Effective March 31, 2025)

| Requirement | AICOS Action |
|------------|--------------|
| 11.6.1: Tamper-detection for payment pages | SRI on all checkout scripts; CSP `report-uri` for unauthorized injection detection |
| 6.4.3: Inventory all payment page scripts | Document every first- and third-party script on Stripe Elements pages; CSP allowlist |
| 12.3.2: Targeted risk analysis | Annual documented risk assessment |
| Scope reassessment frequency | Every 6 months (service providers) or annually (merchants) |

Source: https://deepstrike.io/blog/pci-compliance-in-the-cloud-2025-guide

### Content Security Policy for Stripe Elements

```
Content-Security-Policy:
  default-src 'self';
  script-src  'self' https://js.stripe.com https://*.js.stripe.com;
  frame-src   https://js.stripe.com https://*.js.stripe.com https://hooks.stripe.com;
  connect-src 'self' https://api.stripe.com https://js.stripe.com;
  img-src     'self' data: https://*.stripe.com;
  report-uri  /api/csp-report;
```

Configure via Next.js `headers()` in `next.config.ts` and NestJS Helmet for the API.

### Stripe Webhook Verification

```typescript
// apps/api/src/modules/billing/stripe-webhook.controller.ts
@Post('/billing/webhook')
@HttpCode(200)
async stripeWebhook(
  @Req() req: RawBodyRequest<Request>,
  @Headers('stripe-signature') sig: string,
) {
  let event: Stripe.Event;
  try {
    event = this.stripe.webhooks.constructEvent(
      req.rawBody, sig,
      this.configService.getOrThrow('STRIPE_WEBHOOK_SECRET')
    );
  } catch {
    throw new BadRequestException('Invalid webhook signature');
  }
  // Idempotency: skip duplicates within 24 hours
  const isNew = await this.redis.set(`wh:stripe:${event.id}`, '1', 'NX', 'EX', 86400);
  if (!isNew) return;
  await this.stripeEventService.dispatch(event);
}
```

Requires `rawBody: true` in NestJS `main.ts`. Any JSON middleware on this route corrupts the body and breaks verification.

### Stripe Connect for Multi-Tenant Payouts

For tenants wanting direct bank deposits, use **Stripe Connect** (Standard or Express). AICOS collects an application fee percentage. This delegates payment method collection to Stripe's hosted onboarding and further reduces AICOS's PCI scope.

---

## 4. GDPR Compliance

### Dual Role Clarification

| Context | AICOS Role | Implication |
|---------|-----------|-------------|
| Tenant (store owner) account data | **Data Controller** | AICOS determines purpose and means of processing |
| Tenant's end-customer data | **Data Processor** | AICOS processes on the tenant's (controller's) behalf |

Requirements: DPA with each tenant; sub-processor agreements with all vendors: AWS/Cloudflare, Anthropic, OpenAI, Google, Stripe, SendGrid.

### Data Subject Rights Implementation

All rights fulfilled within **30 days** of a verified request. GDPR fines exceeded €1.6 billion across the EU in 2024. Enforcement is active and accelerating.

Source: https://complydog.com/blog/gdpr-compliance-checklist-complete-guide-b2b-saas-companies

| Right | Article | Implementation |
|-------|---------|---------------|
| Access | 15 | `GET /api/v1/gdpr/data-export` — async ZIP via BullMQ; notify by email with secure download link |
| Rectification | 16 | Standard profile update endpoints; audit log records change |
| Erasure | 17 | `DELETE /api/v1/gdpr/erase` — anonymize PII fields; retain order records 7 years for tax compliance; cascade Meilisearch index removal |
| Restriction | 18 | Flag `processing_restricted = true`; block all non-essential BullMQ jobs for user |
| Portability | 20 | Same endpoint as Art. 15 with `?format=csv`; machine-readable JSON or CSV |
| Object | 21 | Preference center for marketing/analytics; honor immediately |
| Withdraw consent | 7(3) | Consent records with timestamps; withdrawal triggers deletion/restriction pipeline |

### Data Retention Policy

Automated enforcement via BullMQ nightly cron jobs that anonymize or purge records past their retention window.

| Data Category | Retention Period | Legal Basis |
|---------------|-----------------|-------------|
| Active user account data | Account lifetime + 30 days | Contract |
| Order / transaction records | 7 years | Legal obligation (tax/accounting) |
| Payment records (Stripe refs only) | 7 years | Legal obligation |
| Session / access logs | 90 days | Legitimate interest (security) |
| AI video source files | 30 days after extraction (tenant-configurable) | Contract |
| Marketing consent records | 3 years after last interaction | Legal obligation (burden of proof) |
| Audit logs | 2 years hot storage; archive to S3 Glacier years 3–7 | Compliance |
| Anonymized analytics | Indefinite | No personal data |

### EU Data Residency and Transfer Mechanisms

- EU tenant primary region: **AWS eu-west-1 (Ireland)** or **eu-central-1 (Frankfurt)**
- EU tenant media: Cloudflare R2 with **EU jurisdiction bucket** (forces storage in EU data centers)
- AI API calls to Anthropic/OpenAI/Google: international transfers to the US — document under **Standard Contractual Clauses (SCCs)** in sub-processor agreements

**Transfer Impact Assessment (TIA) — required post-Schrems II:** For every SCC-covered transfer to US AI providers, document a TIA assessing whether US surveillance laws (FISA 702, EO 12333) would undermine SCC protections. Use EDPB TIA guidance and templates.

Source: https://www.legiscope.com/blog/cross-border-data-transfers.html

**2025 SCC updates (Q2 2025):** European Commission published clarifications and amendments. Ensure all sub-processor agreements reference the 2021 SCCs with Q2 2025 amendments. Pre-2021 SCCs are no longer valid.

Source: https://gdpr-law.eu/blog/navigating-global-data-rules-what-new-2025-requirements-mean-for-your-business/

### Cookie Consent

- Pre-blocking mandatory: analytics/marketing cookies must not fire before explicit consent
- Categories: Necessary | Analytics | Marketing | AI Personalization
- Record consent timestamp, version, and categories in `consent_records` table
- Google Analytics 4 must use **Consent Mode v2** (required since March 2024)

---

## 5. Secrets Management

### Secret Inventory and Rotation Schedule

| Secret | Stored In | Rotation Cadence |
|--------|-----------|-----------------|
| PostgreSQL connection strings (app + admin) | Vault / Secrets Manager | 90 days |
| Redis connection string | Vault / Secrets Manager | 90 days |
| Stripe secret API key | Vault / Secrets Manager | Annually / on staff departure |
| Stripe webhook signing secrets | Vault / Secrets Manager | Annually |
| AI provider API keys (Anthropic, OpenAI, Gemini) | Vault / Secrets Manager | Quarterly |
| JWT RS256 private key | Vault / Secrets Manager | 90 days |
| Meilisearch master key | Vault / Secrets Manager | Annually |
| S3 / R2 / MinIO access key + secret | Vault / Secrets Manager | 90 days |
| SMTP / SendGrid API key | Vault / Secrets Manager | Annually |

### Tool Recommendation

**P0–P2:** Use **Doppler** (cloud-agnostic; Team plan $10/user/month; syncs to Docker Compose and Kubernetes Secrets automatically with no code changes per deployment target) or **AWS Secrets Manager** ($0.40/secret/month + $0.05/10,000 API calls) if already on AWS.

**P5 (enterprise):** **HashiCorp Vault HCP Dedicated** (~$1.58/hour production cluster). Key benefit: **dynamic secrets** — Vault generates short-lived PostgreSQL credentials per-service per-deployment. If credentials leak, they expire in minutes. Includes a full audit log of every secret access operation.

Source: https://cybersnowden.com/hashicorp-vault-vs-aws-secrets-manager/

### Non-Negotiable Rules

1. **No secrets in source code, ever.** Pre-commit hook (`trufflehog` or `git-secrets`) blocks commits containing API keys or private key material.
2. **No `.env` files committed.** Use `.env.example` with placeholder values only. Add `.env*` to `.gitignore`.
3. **No secrets in Docker image layers.** Use Docker BuildKit `--mount=type=secret` for build-time secrets; inject at runtime via environment injection.
4. **No secrets in application logs.** Configure Pino `redact`:
   ```typescript
   const logger = pino({
     redact: ['req.headers.authorization', 'body.password', 'body.cardNumber', '*.apiKey', '*.secret'],
   });
   ```
5. **JWT RS256 key rotation:** Keep the previous public key active for the 15-minute duration of outstanding access tokens when rotating. Implement a JWKS endpoint exposing multiple public keys.
6. **Least privilege per service:** The `ai-extraction` worker needs AI keys and S3 credentials but not Stripe keys. The `billing` service needs Stripe keys but not AI keys. Separate secret paths per service in Vault.

---

## 6. Rate Limiting and Abuse Prevention

### Why AI and Video Endpoints Are Fundamentally Different

A single video extraction job costs $0.50–$5.00 in AI API tokens (Claude Vision or Gemini 1.5 Pro processing 5–10 minutes of shelf video). A single compromised account can generate thousands of dollars in AI API costs within minutes. This is the **primary financial attack vector** on AI-powered SaaS platforms — not a theoretical concern.

Source: https://www.netlify.com/blog/how-to-rate-limit-ai-features-and-avoid-surprise-costs/

### NestJS Throttler (Redis-backed, Distributed)

Use `@nestjs/throttler` with `@nest-lab/throttler-storage-redis` for distributed rate limiting across all API instances:

```typescript
// apps/api/src/app.module.ts
ThrottlerModule.forRoot({
  throttlers: [
    { name: 'global',        ttl: 60_000,    limit: 120 },
    { name: 'auth',          ttl: 60_000,    limit: 5   },
    { name: 'ai-extraction', ttl: 3_600_000, limit: 3   }, // 3 jobs/hour per user
    { name: 'ai-content',    ttl: 60_000,    limit: 20  },
    { name: 'storefront',    ttl: 60_000,    limit: 300 }, // Public store pages
  ],
  storage: new ThrottlerStorageRedisService(redisClient),
})
```

Source: https://ofeng.org/posts/nestjs-redis-bucket/

### Per-Subscription-Tier AI Limits

| Feature | Starter | Growth | Pro | Enterprise |
|---------|---------|--------|-----|-----------|
| Video extraction jobs / month | 5 | 50 | 500 | Unlimited (credit-based) |
| Max video duration | 2 min | 10 min | 30 min | 60 min |
| AI content generations / day | 20 | 200 | 2,000 | Unlimited |
| AI agent calls / minute | 5 | 20 | 100 | Custom SLA |
| API requests / minute | 60 | 120 | 300 | Custom SLA |

Enforce via `AiCreditGuard` that checks a Redis counter before any BullMQ AI job is enqueued:

```typescript
@Injectable()
export class AiCreditGuard implements CanActivate {
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const { user } = ctx.switchToHttp().getRequest();
    const key = `credits:extraction:${user.tenantId}:${currentMonthKey()}`;
    const used = parseInt((await this.redis.get(key)) ?? '0', 10);
    const limit = TIER_LIMITS[user.tenant.plan].extractionsPerMonth;
    if (used >= limit) {
      throw new TooManyRequestsException(
        `Monthly extraction limit reached (${used}/${limit}). Upgrade your plan to continue.`
      );
    }
    return true;
  }
}
```

Atomically increment after successful enqueue: `redis.incr(key)` with `redis.expireat(key, endOfMonth())`.

### BullMQ Queue-Level Rate Limiter

Prevent overwhelming upstream AI provider APIs:

```typescript
// packages/ai-core/src/workers/extraction.worker.ts
const worker = new Worker('ai-extraction', extractionProcessor, {
  connection: redisConnection,
  limiter: { max: 10, duration: 60_000 }, // 10 jobs/minute across ALL worker instances globally
  concurrency: 2,                          // Max 2 concurrent jobs per worker process
});
```

Source: https://docs.bullmq.io/guide/rate-limiting

### Video Upload Protection

1. **500 MB hard cap** at Nginx/CDN ingress layer — before NestJS sees the request (`client_max_body_size 500m`)
2. **Server-side MIME detection** via `file-type` npm package (magic bytes, not file extension). Accept: `video/mp4`, `video/quicktime`, `video/webm` only
3. **ClamAV virus scan** as async BullMQ job before processing; quarantine unknowns and alert
4. **Pre-signed S3 PUT URLs:** client uploads directly to S3/R2; API never proxies video bytes — prevents server bandwidth exhaustion
5. **Idempotency key:** duplicate submission within 10 minutes returns the in-progress job ID instead of creating a new job

### Abuse Detection Signals

Track in Redis time-series and alert when thresholds are breached:
- Extraction jobs failing > 30% in a rolling 1-hour window (possible prompt injection or adversarial video)
- Token usage per job > 3× the 30-day median (possible adversarial input)
- Same IP submitting jobs for > 3 different tenant accounts within 1 hour
- Account created < 5 minutes ago attempting to submit AI jobs (bot pattern)

---

## 7. Audit Logging

### Event Schema

```typescript
interface AuditEvent {
  id:           string;    // UUID v7 (time-ordered for efficient range queries)
  tenantId:     string;
  actorId:      string;    // User ID or service account identifier
  actorRole:    string;    // Role at time of action
  actorIp:      string;    // Truncated: "1.2.3.x" for IPv4; /56 prefix for IPv6
  action:       string;    // Namespaced: "product.created", "order.status.updated"
  resourceType: string;
  resourceId:   string;
  changes?:     Record<string, { before: unknown; after: unknown }>;
  metadata?:    Record<string, unknown>;
  timestamp:    Date;      // UTC, immutable
  requestId:    string;    // Correlation ID from X-Request-Id header
}
```

### Mandatory Event Categories

- **Authentication:** login (success/failure), logout, password change, MFA events, token refresh, session revoke
- **Authorization:** permission denied, role change, API key creation/revocation
- **Tenant lifecycle:** created, suspended, deleted, plan upgraded/downgraded
- **Data mutations:** product create/update/delete, bulk import, order status changes, payment events
- **AI operations:** extraction job submitted/completed/failed, content generation (log prompt hash, not full prompt text)
- **Admin actions:** every `platform_super_admin` operation
- **GDPR events:** data export requested/delivered, erasure requested/completed, consent changes
- **Security events:** webhook signature failures, rate limit exceeded, anomaly alerts triggered

### Immutability — Two-Tier Approach

**Tier 1 (P0–P3): PostgreSQL RULEs**

```sql
CREATE TABLE audit_log (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID        NOT NULL,
  actor_id      TEXT        NOT NULL,
  actor_role    TEXT        NOT NULL,
  actor_ip      TEXT,
  action        TEXT        NOT NULL,
  resource_type TEXT        NOT NULL,
  resource_id   TEXT        NOT NULL,
  changes       JSONB,
  metadata      JSONB,
  request_id    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Immutability: block all updates and deletes
CREATE RULE no_update_audit AS ON UPDATE TO audit_log DO INSTEAD NOTHING;
CREATE RULE no_delete_audit AS ON DELETE TO audit_log DO INSTEAD NOTHING;

-- RLS: tenants can only read their own audit events
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_tenant_read ON audit_log FOR SELECT
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

**Tier 2 (P5 / SOC 2 path): S3 Object Lock (WORM)**

Stream audit events to an append-only S3 bucket with Object Lock in compliance mode (7-year retention). Simultaneously forward to CloudWatch Logs or Datadog for real-time alerting. Satisfies SOC 2, ISO 27001, and financial regulators requiring tamper-evident records.

Source: https://hoop.dev/blog/immutable-audit-logs-the-foundation-of-saas-governance

### Retention by Framework

| Regulatory Framework | Minimum | AICOS Implementation |
|---------------------|---------|---------------------|
| SOC 2 | 1 year | 2 years hot storage |
| GDPR security incidents | 3 years | Covered by hot + archive |
| Financial/payment audit trail | 7 years | S3 Glacier archive years 3–7 |
| HIPAA (pharmacy tenants) | 6 years | Tier 2 WORM storage required |

### Per-Tenant Audit Log API

Enterprise and compliance-focused tenants require self-service audit log access for their own SOC 2 audits:

```
GET /api/v1/audit-log?from=2026-01-01T00:00:00Z&to=2026-06-01T00:00:00Z
  &action=order.*&limit=100&cursor=<opaque-cursor>
```

Keyset pagination on `(created_at, id)`. RLS enforces isolation server-side; application guard confirms tenantId match. Response includes `next_cursor` for pagination.

### PII Handling in Logs

- Log `actorId` UUID, never email addresses or display names
- Truncate IPv4 to `1.2.3.x` (zero last octet); IPv6 to /56 prefix
- Never log request bodies that may contain passwords, card data, or full PII records
- Pino `redact` configuration as a safety net; application code is the primary control

---

## 8. Web Security — XSS, CSRF, SQLi

### SQL Injection Prevention

Prisma ORM uses parameterized queries for all standard operations. SQL injection is not possible through Prisma's typed API. Residual risks:

```typescript
// SAFE: Prisma.sql tagged template enforces parameterization
const result = await prisma.$queryRaw<Product[]>(
  Prisma.sql`SELECT * FROM products WHERE tenant_id = ${tenantId} AND sku = ${sku}`
);

// NEVER: string interpolation = SQL injection vulnerability
// This pattern is BANNED via ESLint rule across the entire monorepo
const result = await prisma.$queryRawUnsafe(`SELECT * FROM products WHERE sku = '${sku}'`);
```

Add ESLint rule banning `$queryRawUnsafe` and `$executeRawUnsafe` across the monorepo. Also validate and sanitize all Meilisearch filter expressions before passing to the search client.

Source: https://blog.arcjet.com/protecting-your-node-js-app-from-sql-injection-xss-attacks/

### XSS Prevention

Next.js App Router automatically escapes all JSX output. Remaining attack surfaces:

1. **`dangerouslySetInnerHTML`** — prohibited via ESLint rule `react/no-danger`; no exceptions without security review
2. **AI-generated rich text (product descriptions, SEO copy)** — sanitize with DOMPurify before rendering:
   ```typescript
   import DOMPurify from 'isomorphic-dompurify';
   const safeHtml = DOMPurify.sanitize(aiGeneratedHtml, {
     ALLOWED_TAGS: ['p', 'b', 'i', 'em', 'strong', 'ul', 'ol', 'li', 'br', 'a', 'h2', 'h3'],
     ALLOWED_ATTR: ['href', 'target', 'rel'],
   });
   ```
3. **User-supplied strings in page titles / meta tags** — always pass through React text interpolation (automatic escaping)

**Content Security Policy (Stripe-compatible, nonce-based):**

```
Content-Security-Policy:
  default-src 'self';
  script-src  'self' 'nonce-{RANDOM}' https://js.stripe.com https://*.js.stripe.com;
  style-src   'self' 'unsafe-inline';
  img-src     'self' data: blob:
              https://*.r2.cloudflarestorage.com https://*.amazonaws.com https://*.stripe.com;
  connect-src 'self' https://api.stripe.com https://js.stripe.com;
  frame-src   https://js.stripe.com https://*.js.stripe.com https://checkout.stripe.com;
  object-src  'none';
  base-uri    'self';
  form-action 'self';
  report-uri  /api/csp-report;
```

Generate a fresh nonce per request in Next.js App Router middleware. Avoid `unsafe-eval`.

Source: https://digiqt.com/blog/nextjs-security-best-practices/

### CSRF Prevention

NestJS with stateless JWT in the `Authorization` header is **not vulnerable to classic CSRF** (cross-origin requests cannot set custom headers). Additional measures:

- **Double Submit Cookie** pattern for httpOnly cookie-backed endpoints (refresh token rotation)
- **Next.js App Router server actions**: built-in CSRF protection via `origin` header validation
- **`SameSite=Strict`** on the refresh token cookie prevents cross-origin cookie submission in modern browsers

Source: https://docs.nestjs.com/security/csrf

### Security Headers (Helmet Configuration)

```typescript
// apps/api/src/main.ts
app.use(helmet({
  contentSecurityPolicy: {
    directives: { /* full directive set as defined above */ },
  },
  hsts: { maxAge: 31_536_000, includeSubDomains: true, preload: true },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  permittedCrossDomainPolicies: false,
  crossOriginEmbedderPolicy: false, // Must be false — Stripe iframes require it
}));
```

Required headers: `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, HSTS (max-age 1 year + preload).

### Input Validation

```typescript
// apps/api/src/main.ts
app.useGlobalPipes(new ValidationPipe({
  whitelist: true,              // Strip unknown properties silently
  forbidNonWhitelisted: true,   // Throw 400 on unknown properties
  transform: true,
  transformOptions: { enableImplicitConversion: false },
}));
```

Validate file uploads with magic-byte inspection (`file-type` package, not just MIME headers). Enforce max sizes before reading content.

---

## 9. Webhook Signature Verification

### Four Universal Requirements

All inbound webhooks from external providers must satisfy these before any business logic executes:

1. **HMAC-SHA256 signature** verified with timing-safe comparison
2. **Timestamp validation** — reject events older than 5 minutes (replay attack prevention)
3. **Event deduplication** — Redis `SET NX` with event ID, 24-hour TTL
4. **Raw body preservation** — NestJS route must not JSON-parse the body before verification

Source: https://www.hooklistener.com/learn/webhook-security-fundamentals

### Generic HMAC Verification Utility

```typescript
// packages/shared/src/security/webhook-verify.ts
import { createHmac, timingSafeEqual } from 'crypto';

export function verifyWebhookSignature(options: {
  rawBody:    Buffer;
  received:   string;
  secret:     string;
  timestamp?: string;
}): void {
  const { rawBody, received, secret, timestamp } = options;

  if (timestamp) {
    const age = Math.abs(Date.now() / 1_000 - parseInt(timestamp, 10));
    if (age > 300) throw new UnauthorizedException('Webhook timestamp too old (replay attack)');
  }

  const payload = timestamp ? `${timestamp}.${rawBody}` : rawBody.toString('utf8');
  const expected = createHmac('sha256', secret).update(payload).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(received, 'utf8');

  // timingSafeEqual prevents timing oracle attacks that could enable signature forgery
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new UnauthorizedException('Webhook signature mismatch');
  }
}
```

Algorithm choice: HMAC-SHA256. SHA1 and MD5 are cryptographically broken for MAC use. Always use `crypto.timingSafeEqual` — standard string comparison leaks timing information.

Source: https://hookdeck.com/webhooks/guides/how-to-implement-sha256-webhook-signature-verification

### Stripe Webhook (Full Implementation)

```typescript
// apps/api/src/modules/billing/stripe-webhook.controller.ts
@Post('/billing/webhook')
@HttpCode(200)
async stripeWebhook(
  @Req() req: RawBodyRequest<Request>,
  @Headers('stripe-signature') sig: string,
): Promise<void> {
  let event: Stripe.Event;
  try {
    // constructEvent internally handles HMAC verification AND timestamp validation
    event = this.stripe.webhooks.constructEvent(
      req.rawBody, sig,
      this.configService.getOrThrow('STRIPE_WEBHOOK_SECRET')
    );
  } catch {
    throw new BadRequestException('Invalid webhook signature');
  }
  // Idempotency guard
  const isNew = await this.redis.set(`wh:stripe:${event.id}`, '1', 'NX', 'EX', 86_400);
  if (!isNew) return;
  await this.stripeEventService.dispatch(event);
}
```

### Internal Webhook Signing (AI Worker Callbacks)

For BullMQ worker-to-API result callbacks, use ephemeral per-job signing tokens:
1. API generates `crypto.randomBytes(32).toString('hex')` when enqueueing
2. Token stored in Redis: `wh:job:{jobId}:token` with TTL = job timeout + 30 minutes
3. Worker includes token in callback request header; API verifies with `timingSafeEqual`
4. Token deleted from Redis immediately after successful verification

This follows the 2025 best practice of short-lived signing keys (15 min–24 hours) rather than long-lived static secrets, dramatically reducing blast radius of a leaked key.

---

## 10. Prioritized Control Checklist

Controls prioritized by phase. Within each phase, ordered by risk impact.

### P0 — Must Ship Before Any Production Traffic

| # | Control | Concrete Implementation | Risk if Skipped |
|---|---------|------------------------|-----------------|
| 1 | RLS enabled + FORCE on all tenant tables | `ALTER TABLE x FORCE ROW LEVEL SECURITY` on every tenant-scoped table | Cross-tenant data leakage (business-ending) |
| 2 | Transaction-scoped set_config for tenant context | `set_config('app.current_tenant_id', id, TRUE)` inside `$transaction` | Cross-tenant leakage via connection pool reuse |
| 3 | Composite indexes (tenant_id, ...) on all tenant tables | `CREATE INDEX ON products (tenant_id, id)` etc. | RLS performance collapse under any real load |
| 4 | No superuser in application connection string | Dedicated `aicos_app` role; no BYPASSRLS; admin role separate with separate credentials | Full DB exposure if app credentials leak |
| 5 | JWT httpOnly cookies, 15-min access / 7-day refresh | NestJS auth module; Redis allowlist for instant revocation | Session hijacking via XSS |
| 6 | RBAC guard with tenant-context check on every route | `TenantRbacGuard`: validates role AND tenantId match | Horizontal privilege escalation across tenants |
| 7 | Stripe webhook signature verification | `stripe.webhooks.constructEvent` with raw body; `rawBody: true` in main.ts | Fake payment confirmations; free orders |
| 8 | All secrets in Vault / Secrets Manager | Doppler (P0–P2) or AWS Secrets Manager; zero secrets in .env or source | API key exfiltration → AI/payment fraud |
| 9 | Global ValidationPipe (whitelist + forbidNonWhitelisted) | `new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })` | Injection attacks; unexpected behavior from extra fields |
| 10 | Helmet security headers on all responses | `app.use(helmet())` with HSTS, CSP, frame options | XSS, clickjacking, MIME sniffing |
| 11 | HTTPS enforced everywhere, HSTS preload | Nginx redirect + `Strict-Transport-Security: max-age=31536000; preload` | MITM attacks, session cookie theft |
| 12 | Auth endpoint rate limiting | ThrottlerGuard: 5 login attempts/minute per IP (Redis-backed shared store) | Brute-force account takeover |
| 13 | PostgreSQL 16.9+ (CVE-2025-8713 patched) | Pin Docker image: `postgres:16.9-alpine` or later | Optimizer statistics leak RLS-protected row data |
| 14 | No raw SQL string interpolation in codebase | ESLint: ban `$queryRawUnsafe`, `$executeRawUnsafe`; enforce `Prisma.sql` usage | SQL injection |

### P1 — Ship Within First Production Sprint

| # | Control | Concrete Implementation | Risk if Skipped |
|---|---------|------------------------|-----------------|
| 15 | AI extraction rate limiting (per-plan credit guards) | `AiCreditGuard`: Redis counter checked before BullMQ job enqueue | $1,000s/day AI API cost abuse from a single account |
| 16 | Video upload: pre-signed URLs + magic-byte validation + 500 MB limit | `file-type` library; Nginx `client_max_body_size 500m`; pre-signed S3 PUT URLs | Malware upload, server bandwidth exhaustion |
| 17 | BullMQ queue-level limiter for AI workers | `limiter: { max: 10, duration: 60_000 }` on the extraction queue | AI provider rate-limit bans; runaway AI API cost |
| 18 | Audit log table with immutability RULEs | PostgreSQL `CREATE RULE no_update_audit` / `no_delete_audit` | Cannot produce evidence in a security incident |
| 19 | SAQ A PCI posture: Stripe Elements only, zero PAN storage | Audit codebase for card number patterns; CI scan blocks any raw card data handling | PCI non-compliance (fines + payment processor termination) |
| 20 | Full CSP with Stripe allowlist and report-uri | Next.js middleware + NestJS Helmet directives + CSP violation reporting | XSS on payment page → PCI DSS 11.6.1 violation |
| 21 | Webhook idempotency (event ID deduplication) | Redis `SET wh:stripe:{event.id} 1 NX EX 86400` | Duplicate order fulfillment; double-charging customers |
| 22 | GDPR DSAR endpoints | `GET /api/v1/gdpr/data-export`, `DELETE /api/v1/gdpr/erase` with async BullMQ jobs | GDPR enforcement; fines up to €20M or 4% global revenue |
| 23 | Automated data retention enforcement | BullMQ nightly cron job; anonymize/purge records per retention table | Storing data beyond legal basis → GDPR violation |
| 24 | Meilisearch per-tenant tokens for all storefront search | `client.generateTenantToken` with embedded `tenant_id` filter; 1-hour TTL | Cross-tenant product and pricing data exposure |
| 25 | HaveIBeenPwned breach detection on passwords | k-anonymity prefix check (SHA-1 first 5 chars only sent to API) on registration + password change | Credential stuffing attacks succeed silently |

### P2 — Before AI Features Launch (Phase 2)

| # | Control | Concrete Implementation | Risk if Skipped |
|---|---------|------------------------|-----------------|
| 26 | AI prompt injection defense | Sanitize user inputs before embedding in prompts; validate AI outputs before persisting; never trust AI output as executable code | Attacker manipulates AI to corrupt store catalog data |
| 27 | DOMPurify for all AI-generated HTML | `isomorphic-dompurify` with restrictive allowlist on all AI rich-text output before rendering | Stored XSS via AI-generated product descriptions |
| 28 | Transfer Impact Assessments for US AI providers | Document TIAs for Anthropic, OpenAI, Google per EDPB guidance and templates | GDPR enforcement action for EU tenants (Schrems II) |
| 29 | MFA enforcement for tenant_owner and above | TOTP via `otplib`; gate account activation on MFA setup for privileged roles; no bypass path | Account takeover → full tenant data breach and business disruption |
| 30 | Abuse detection alerting | Redis time-series tracking anomalous token usage, rapid account creation; PagerDuty / Slack alerts on threshold breach | Coordinated abuse campaigns run for hours undetected |
| 31 | Video frame PII scrubbing before AI processing | Blur pipeline for faces and license plates, or contractual prohibition on filming people | GDPR violation: processing biometric data without consent |
| 32 | Internal webhook signing for worker-to-API callbacks | Ephemeral per-job HMAC tokens; Redis-stored; verified with `timingSafeEqual` | AI job result spoofing → corrupted product catalog data |

### P3 — Before Enterprise / Scale Phase

| # | Control | Concrete Implementation | Risk if Skipped |
|---|---------|------------------------|-----------------|
| 33 | HashiCorp Vault dynamic database credentials | Vault PostgreSQL secrets engine generating short-lived per-service roles | Credential compromise enables lateral movement across all services |
| 34 | S3 Object Lock (WORM) for audit logs | AWS S3 Compliance mode or Cloudflare R2 WORM equivalent; 7-year retention policy | Audit log tampering; failed SOC 2 Type II audit |
| 35 | Per-tenant audit log API | Cursor-paginated `GET /audit-log` with RLS enforcement; JSON and CSV export | Blocks enterprise procurement (customer SOC 2 evidence requirement) |
| 36 | EU data residency routing for EU tenants | Deploy in eu-west-1 / eu-central-1; R2 EU jurisdiction bucket for media | GDPR data residency preferences; EU enterprise procurement blockers |
| 37 | Annual third-party penetration test | Scope: API, web frontend, AI endpoints, admin panel; remediate critical findings before launch | Undiscovered exploitable vulnerabilities in production |
| 38 | SOC 2 Type I readiness assessment | Engage auditor; document controls; remediate gaps; target Type II in year 2 | Enterprise customers require SOC 2 report for procurement approval |
| 39 | Vulnerability disclosure policy and security.txt | `/.well-known/security.txt` with security contact email and PGP key | No responsible disclosure channel; vulnerabilities go unreported |
| 40 | WebAuthn / Passkey support | `@simplewebauthn/server` + `@simplewebauthn/browser` | Phishing-resistant authentication unavailable for security-conscious power users |

---

## Appendix A: Threat Model Summary

| Threat | Likelihood | Impact | Primary Controls |
|--------|-----------|--------|-----------------|
| Cross-tenant data leakage via RLS bypass | High (without controls) | Catastrophic | FORCE RLS + transaction-scoped set_config + app-layer tenant check |
| AI API cost exhaustion via abuse | High | High ($$$) | AiCreditGuard + BullMQ limiter + per-tier quotas |
| Account takeover via credential stuffing | High | High | Breach detection + MFA mandate + auth rate limiting |
| Payment fraud via webhook forgery | Medium | High | Stripe constructEvent + idempotency dedup |
| XSS via AI-generated content | Medium | Medium | DOMPurify + CSP nonce |
| GDPR enforcement action | Medium | Very High (€20M+) | DSAR endpoints + retention automation + DPAs + TIAs |
| Secrets exposure via source code or .env | Medium | Catastrophic | Vault / Secrets Manager + trufflehog pre-commit hook |
| SQL injection | Low (Prisma ORM) | Catastrophic | Prisma.sql parameterized queries + ESLint ban on rawUnsafe |
| Supply chain attack (malicious npm package) | Medium | High | Dependabot + npm audit in CI + Snyk scanning |
| Replay attack on webhooks | Low | High | 5-minute timestamp window + event ID deduplication |
| Prompt injection via user-supplied content | Medium (grows with AI feature adoption) | High | Input sanitization + output validation + human review gate |
| Meilisearch cross-tenant search | Medium (without controls) | High | Per-tenant tokens with embedded filter enforcement |

---

## Appendix B: Key Package References

| Purpose | Package(s) |
|---------|-----------|
| Security headers | `@nestjs/helmet` (wraps `helmet`) |
| HTTP rate limiting | `@nestjs/throttler` + `@nest-lab/throttler-storage-redis` |
| Queue rate limiting | `bullmq` native `limiter` option |
| Input validation | `class-validator` + `class-transformer` |
| Password hashing | `bcrypt` (cost factor 12) |
| MFA / TOTP | `otplib` |
| WebAuthn / Passkey (P3) | `@simplewebauthn/server` + `@simplewebauthn/browser` |
| XSS sanitization | `isomorphic-dompurify` |
| File type / MIME detection | `file-type` |
| Webhook HMAC verification | Node.js built-in `crypto` (`createHmac` + `timingSafeEqual`) |
| Secrets management | Doppler CLI / AWS SDK Secrets Manager / `@hashicorp/vault-client` |
| Breach detection | HaveIBeenPwned k-anonymity API |
| Pre-commit secret scanning | `trufflehog` or `git-secrets` |

---

## Sources

- https://aws.amazon.com/blogs/database/multi-tenant-data-isolation-with-postgresql-row-level-security/
- https://www.permit.io/blog/postgres-rls-implementation-guide
- https://medium.com/@instatunnel/multi-tenant-leakage-when-row-level-security-fails-in-saas-da25f40c788c
- https://www.thenile.dev/blog/multi-tenant-rls
- https://www.simplyblock.io/blog/underated-postgres-multi-tenancy-with-row-level-security/
- https://js.elitedev.in/js/build-multi-tenant-saas-with-nestjs-prisma-postgresql-complete-rls-implementation-guide-c377189c/
- https://github.com/prisma/prisma/issues/5128
- https://docs.stripe.com/security/guide
- https://stripe.com/resources/more/pci-dss-checklist-for-businesses
- https://deepstrike.io/blog/pci-compliance-in-the-cloud-2025-guide
- https://complydog.com/blog/gdpr-compliance-checklist-complete-guide-b2b-saas-companies
- https://www.legiscope.com/blog/cross-border-data-transfers.html
- https://gdpr-law.eu/blog/navigating-global-data-rules-what-new-2025-requirements-mean-for-your-business/
- https://medium.com/@sabin.shrestha.er/stop-rebuilding-auth-a-production-ready-jwt-rbac-template-for-nestjs-18d99f9b8944
- https://docs.logto.io/api-protection/nodejs/nestjs
- https://docs.nestjs.com/security/csrf
- https://blog.arcjet.com/protecting-your-node-js-app-from-sql-injection-xss-attacks/
- https://digiqt.com/blog/nextjs-security-best-practices/
- https://cybersnowden.com/hashicorp-vault-vs-aws-secrets-manager/
- https://www.netlify.com/blog/how-to-rate-limit-ai-features-and-avoid-surprise-costs/
- https://docs.bullmq.io/guide/rate-limiting
- https://ofeng.org/posts/nestjs-redis-bucket/
- https://hoop.dev/blog/immutable-audit-logs-the-foundation-of-saas-governance
- https://www.hooklistener.com/learn/webhook-security-fundamentals
- https://hookdeck.com/webhooks/guides/how-to-implement-sha256-webhook-signature-verification
