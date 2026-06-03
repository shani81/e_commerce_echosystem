# AI Provider Abstraction Layer (`packages/ai-core`)

**Module:** `ai-core` — "AI Provider Abstraction & Agent Orchestration"
**Phase:** P2 (foundations provisioned in P0 for billing/usage events)
**Build status:** Planned — 0% (PHASE 0 planning)
**Owner:** AI/ML Architect
**Date:** 2026-06-03

> Spec decision D-005: *Default AI provider = Anthropic Claude, behind a provider-abstraction layer supporting OpenAI + Gemini — swap providers with no code change.*

---

## 1. Purpose & Scope

`packages/ai-core` is the **single chokepoint** through which every AI call in AICOS flows. No module (extraction, content, marketing, pricing, customer-service, etc.) ever imports `@anthropic-ai/sdk`, `openai`, or `@google/genai` directly. They depend only on the abstract interfaces below.

This buys us:

1. **Provider portability** — swap Claude → Gemini → OpenAI per-call, per-tenant, or globally with a config change (no code change). Required by the proposal.
2. **Cost governance** — every call emits an `ai.usage` event (provider, model, tokens, dollars) consumed by the `billing` module to deduct tenant credits. Without this, AI cost tracking is impossible (architecture finding).
3. **Resilience** — automatic fallback chain when a provider returns 429 / 5xx / times out, so a single-provider outage never takes the flagship feature down.
4. **Safety** — one place to enforce JSON-schema validation, prompt-injection guards, PII redaction in logs, and DOMPurify sanitization of generated HTML.
5. **Observability** — uniform tracing, structured logging, and latency/cost metrics across every model in the platform.

Scope: **chat (text)**, **vision (image understanding)**, and **embeddings**. Image *generation* (theme/store-builder, P3) and audio are out of scope for v1 of this package and added later behind the same factory.

---

## 2. Unified Capability Interfaces

Three capabilities, one provider can implement one or more. TypeScript interfaces (the contract every provider adapter must satisfy):

```typescript
// packages/ai-core/src/contracts/capabilities.ts

export type Capability = 'chat' | 'vision' | 'embedding';

export interface AiMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: AiContentPart[];
}

export type AiContentPart =
  | { type: 'text'; text: string; cacheable?: boolean }   // cacheable -> prompt caching breakpoint
  | { type: 'image'; source: ImageSource }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; toolUseId: string; content: string };

export type ImageSource =
  | { kind: 'base64'; mediaType: string; data: string }
  | { kind: 'url'; url: string }                          // R2/MinIO pre-signed or provider Files API
  | { kind: 'file_id'; provider: ProviderName; fileId: string }; // uploaded once, referenced N times

export interface ChatRequest {
  messages: AiMessage[];
  system?: string;
  tools?: AiToolSchema[];
  jsonSchema?: object;          // when set -> structured output / JSON mode enforced
  maxTokens?: number;
  temperature?: number;         // default 0.2 for extraction/structured; 0.7 for creative content
  stop?: string[];
  stream?: boolean;
}

export interface ChatResponse {
  text: string;
  parsed?: unknown;             // validated against jsonSchema when provided
  toolCalls?: AiToolCall[];
  finishReason: 'stop' | 'length' | 'tool_use' | 'content_filter';
  usage: AiUsage;
  meta: CallMeta;
}

export interface EmbeddingRequest {
  inputs: string[];             // text; image embeddings (CLIP) handled by a dedicated vision-embedding adapter
  dimensions?: number;
}

export interface EmbeddingResponse {
  vectors: number[][];
  usage: AiUsage;
  meta: CallMeta;
}

export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;      // prompt-cache hits (cheap)
  cacheWriteTokens: number;     // prompt-cache writes (one-time premium)
  costUsd: number;              // computed by the abstraction, not the caller
}

export interface CallMeta {
  provider: ProviderName;
  model: string;
  requestId: string;            // our id (cuid) — correlates logs, traces, billing
  providerRequestId?: string;   // provider's id for support tickets
  latencyMs: number;
  attempt: number;              // 1 = primary, 2+ = fallback
  cached: boolean;              // response served from our semantic/exact cache
  tenantId: string;
  agent?: AgentName;            // which AI agent initiated this call
  feature?: string;            // e.g. 'extraction.frame_batch'
}
```

The provider adapter contract:

```typescript
// packages/ai-core/src/contracts/provider.ts

export type ProviderName = 'anthropic' | 'openai' | 'google';

export interface AiProvider {
  readonly name: ProviderName;
  readonly capabilities: Capability[];
  supportsModel(model: string): boolean;

  chat(req: ChatRequest, ctx: CallContext): Promise<ChatResponse>;
  vision(req: ChatRequest, ctx: CallContext): Promise<ChatResponse>;   // chat with image parts
  embed(req: EmbeddingRequest, ctx: CallContext): Promise<EmbeddingResponse>;

  // cost is owned by the provider adapter because token->$ rules differ per provider
  estimateCost(usage: Omit<AiUsage, 'costUsd'>, model: string): number;
  // health probe used by the router to skip a degraded provider proactively
  health(): Promise<{ healthy: boolean; reason?: string }>;
}

export interface CallContext {
  tenantId: string;
  agent?: AgentName;
  feature?: string;
  idempotencyKey?: string;      // dedupe identical calls (retries, queue redelivery)
  deadlineMs?: number;          // hard wall-clock budget; router aborts + fails over
  budgetUsd?: number;           // per-call dollar ceiling; refuse if estimate exceeds
}
```

Callers depend on the high-level service, never on `AiProvider` directly:

```typescript
// what every module imports
const result = await aiCore.chat({ messages, jsonSchema: ProductSchema }, {
  tenantId, agent: 'Extraction Agent', feature: 'extraction.frame_batch',
});
```

---

## 3. Model Registry (config-driven, no code change to swap)

Models are declared in config (Doppler-backed JSON), **not hardcoded**. This is what makes "swap providers with no code change" real, and it is the mitigation for the Gemini deprecation risk (2.0 Flash was shut down June 2026 — pin IDs in config, never in code).

```jsonc
// packages/ai-core/config/models.json (loaded at boot, hot-reloadable)
{
  "defaultProvider": "anthropic",
  "models": {
    "claude-sonnet":   { "provider": "anthropic", "id": "claude-sonnet-4-6", "caps": ["chat","vision"],
                         "inUsd": 3.00,  "outUsd": 15.00, "cacheReadUsd": 0.30, "cacheWriteUsd": 3.75,
                         "imageTokenFormula": "w*h/750", "maxImageTokens": 1568 },
    "claude-opus":     { "provider": "anthropic", "id": "claude-opus-4-8",  "caps": ["chat","vision"],
                         "inUsd": 15.00, "outUsd": 75.00, "maxImageTokens": 4784 },
    "claude-haiku":    { "provider": "anthropic", "id": "claude-haiku-4-5", "caps": ["chat","vision"],
                         "inUsd": 0.80,  "outUsd": 4.00 },
    "gemini-flash":    { "provider": "google", "id": "gemini-2.5-flash", "caps": ["chat","vision"],
                         "inUsd": 0.30, "outUsd": 2.50, "contextTokens": 1000000 },
    "gemini-flash-lite":{ "provider": "google", "id": "gemini-2.5-flash-lite", "caps": ["chat","vision"],
                         "inUsd": 0.10, "outUsd": 0.40 },
    "gpt-4.1":         { "provider": "openai", "id": "gpt-4.1", "caps": ["chat","vision"],
                         "inUsd": 2.00, "outUsd": 8.00 },
    "text-embed-3":    { "provider": "openai", "id": "text-embedding-3-large", "caps": ["embedding"],
                         "inUsd": 0.13, "dimensions": 3072 }
  },
  "aliases": {
    "extraction.primary":   "gemini-flash",
    "extraction.fallback":  "claude-sonnet",
    "extraction.premium":   "claude-opus",
    "content.default":      "claude-sonnet",
    "content.bulk":         "gemini-flash",
    "embedding.default":    "text-embed-3"
  }
}
```

**Rule:** callers reference *aliases* (`extraction.primary`), never raw model IDs. Ops repoints an alias in config to roll a model forward (e.g., `gemini-2.5-flash` → `gemini-3-flash`) with zero deploys.

---

## 4. Routing & Fallback

### 4.1 Routing policy (which model runs first)

Selection order, highest precedence first:

1. **Explicit caller override** — `req.model` (rare; admin tools, A/B tests).
2. **Super-admin per-tenant override** — stored in DB; lets support force a provider for a problem tenant.
3. **Tenant-plan policy** — Starter/Growth route to cost-optimized models (`gemini-flash` / `gemini-flash-lite`); Pro/Enterprise route to quality models (`claude-sonnet`/`claude-opus`). Implements the cost/quality tier from the extraction research.
4. **Feature alias default** — e.g. `extraction.primary`.
5. **Global default provider** — `anthropic` (D-005).

### 4.2 Fallback chain

Each alias has an ordered fallback list. The router walks it on retryable failure:

```jsonc
"fallbackChains": {
  "extraction.primary": ["gemini-flash", "claude-sonnet", "gpt-4.1"],
  "content.default":     ["claude-sonnet", "gpt-4.1", "gemini-flash"],
  "embedding.default":   ["text-embed-3", "gemini-embed"]
}
```

**Triggers for failover (next model in chain):**
- HTTP `429` (rate limit) — after exponential backoff exhausts on the current provider.
- HTTP `5xx` / connection error / timeout past `deadlineMs`.
- Provider health probe returns unhealthy (skip proactively).
- `content_filter` finish reason that we classify as a false positive (configurable per feature).

**NOT retryable / no failover (fail fast):**
- `400` schema/validation error in *our* request (bug — surface loudly, don't burn budget on other providers).
- `401/403` auth (config error).
- Per-call `budgetUsd` would be exceeded by the next provider.

Backoff: exponential `2s, 4s, 8s` with full jitter, max 3 attempts **per provider** before advancing the chain. Total wall-clock is bounded by `deadlineMs` (extraction frame batches default 30s; interactive chat 15s).

### 4.3 Per-provider rate-limit tracking

A Redis-backed token bucket per `(provider, model)` tracks remaining quota from response headers (`anthropic-ratelimit-*`, Gemini quota, OpenAI `x-ratelimit-*`). When a bucket is near-empty the router **pre-emptively** shifts new calls to the next provider instead of waiting for a 429. BullMQ workers honor the same bucket so 10 concurrent `FrameAnalysisWorker`s don't collectively blow the Gemini RPM limit.

---

## 5. Caching (two distinct layers)

### 5.1 Provider prompt-caching (in-flight, per-call)

Long, stable prefixes (system prompts, JSON schemas, few-shot examples, extraction rubric) are marked `cacheable: true` so the abstraction inserts a **cache breakpoint**:

- **Anthropic:** `cache_control: { type: 'ephemeral' }` on the last stable block. Cache reads are ~10% of input price (`$0.30/M` vs `$3.00/M` for Sonnet). 5-minute TTL (extendable to 1h).
- **Gemini:** implicit + explicit context caching for the 1M-context multi-frame batches.
- **OpenAI:** automatic prefix caching (no flag needed; we still order messages prefix-stable).

This matters most for the flagship: the extraction prompt + rubric is the same across all ~10 frame batches of a video, so the second batch onward reads the prompt from cache. Estimated savings: **~25-40% of input-token spend** on multi-batch jobs. `usage.cacheReadTokens` / `cacheWriteTokens` are surfaced and billed at the correct (cheaper) rate.

### 5.2 Our response cache (cross-call, persistent)

Two modes, keyed and stored in Redis (hot) with optional Postgres durability:

- **Exact cache** — SHA-256 of `(model, normalized messages, jsonSchema, temperature)`. Deterministic calls (`temperature=0`, e.g. barcode-DB enrichment prompts, SEO templates for identical inputs) return instantly at $0. TTL 24h, tenant-scoped key namespace (never cross-tenant).
- **Semantic cache** *(opt-in, content features only)* — embed the request, look up pgvector for cosine > 0.97; if hit, reuse the prior generation. Disabled for extraction (every video is unique) and anything price/inventory-sensitive.

Cache is bypassed when `idempotencyKey` differs or `noCache: true`. All cache hits still emit an `ai.usage` event with `costUsd: 0, cached: true` so billing and analytics see them.

---

## 6. Cost Tracking & the `ai.usage` Event

Every successful (or partially-charged) call emits exactly one event onto the `ai.usage` BullMQ stream:

```typescript
interface AiUsageEvent {
  requestId: string;
  tenantId: string;
  agent?: AgentName;
  feature?: string;          // 'extraction.frame_batch' | 'content.product_description' | ...
  provider: ProviderName;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;           // authoritative, computed here
  imageCount: number;
  latencyMs: number;
  cached: boolean;
  attempt: number;
  ts: string;                // ISO-8601
}
```

**Consumers:**
- `billing` — converts `costUsd`/feature into **AI credits** and decrements the tenant's balance; enforces the `AiCreditGuard` (see §8). Extraction minutes and generation credits are metered Stripe Billing add-ons (payments research).
- `analytics` — per-tenant, per-feature, per-model cost dashboards; margin tracking (charge $0.50-$2.00 vs $0.10-$0.15 cost → 3-13x margin from extraction research).
- `master-brain` cost governance (P5) — anomaly alerts when a tenant's burn spikes (abuse / cost-bomb detection).

Cost is computed **inside the abstraction** from the model registry rates, never trusted from the caller. This is the only place token→dollar math lives.

---

## 7. Observability

- **Tracing:** OpenTelemetry span per call (`ai.chat`, `ai.vision`, `ai.embed`) with attributes `provider`, `model`, `tenantId`, `agent`, `feature`, `attempt`, `cached`, `costUsd`. Spans nest under the BullMQ job span so a whole extraction video is one trace.
- **Metrics (Prometheus):** `ai_call_latency_ms` (histogram, by model), `ai_call_cost_usd_total` (counter), `ai_call_errors_total` (by provider/status), `ai_fallback_total` (by from→to), `ai_cache_hit_ratio`, `ai_tokens_total`.
- **Structured logs:** one JSON line per call with the `CallMeta`. **PII/secret redaction is mandatory** — request text is hashed or truncated, never logged raw at info level (debug-only, behind a flag, with payloads redacted of customer data). API keys never appear in logs (trufflehog pre-commit + log scrubber).
- **Audit:** `rawResponse` of AI calls that *write to user-visible data* (extraction drafts, generated content) is persisted to the originating record for debugging, dispute evidence, and future fine-tuning. Stored ≤1KB JSON; trivial cost.
- **Dashboards:** Grafana — per-model cost/day, fallback rate, p50/p95/p99 latency per feature, cache-hit ratio, error budget. Alert when fallback rate > 5% (provider degradation) or any model's p95 latency regresses 2x.

---

## 8. Safety, Guardrails & Governance (cross-cutting)

These live in the abstraction so no caller can forget them:

1. **JSON-schema validation** — when `jsonSchema` is set, the response is parsed and validated; on failure the abstraction auto-retries with a "repair" instruction once, then fails (no malformed AI data reaches the DB).
2. **Prompt-injection defense** — user-supplied content (video frames' OCR text, customer messages, cloned-site HTML) is wrapped in clearly delimited, role-`user` blocks and never concatenated into the system prompt. Tool-use outputs are schema-validated before re-entry.
3. **PII redaction** — outbound request bodies are scanned for obvious PII before logging; customer data sent to providers is covered by DPAs + Transfer Impact Assessments (Schrems II, security research) — provider region/zero-retention settings configured where available.
4. **`AiCreditGuard`** — pre-call check against the tenant's remaining credit balance + per-tier rate limit (Redis). A single compromised account can otherwise burn $5,000+/hour (security research). Three enforcement layers: NestJS `Throttler` (HTTP), `AiCreditGuard` (Redis credit/balance), BullMQ queue limiter (`{ max, duration }`). Calls exceeding `budgetUsd` are refused before any provider is hit.
5. **Output sanitization** — any AI-generated **HTML** (content/SEO/theme) is run through DOMPurify before persistence to kill stored-XSS vectors (security research, P2 prerequisite).
6. **Human-in-the-loop gate** — the abstraction itself never publishes. AI output lands in `*_draft` tables; a human "Publish" action is the only path to live data (D: "Nothing AI-generated publishes automatically"). Enforced at the orchestration layer (§9).

---

## 9. Agent Orchestration

`ai-core` also hosts the lightweight orchestration runtime that the 12 AI agents (see `ai-agents-spec.md`) run on:

- **Agent base class** — declares `name`, `defaultModelAlias`, `fallbackChain`, `tools[]`, `systemPrompt`, `guardrails`, `humanGate: boolean`.
- **Tool registry** — typed tools (function-calling) an agent may invoke (e.g. `lookupBarcode`, `searchCatalog`, `getInventory`, `createDraft`). Tools are tenant-scoped and run through the same RLS-protected services as the rest of the app.
- **Run loop** — bounded multi-step tool-use loop (max N steps, hard `deadlineMs`, budget cap) with full trace capture. Each step is a `chat`/`vision` call through the router, so fallback/caching/cost all apply uniformly.
- **Handoffs** — agents enqueue follow-on work via BullMQ (e.g. Extraction Agent → Product Agent → SEO Agent), never call each other synchronously, preserving idempotency and back-pressure.

---

## 10. Package Layout

```
packages/ai-core/
  src/
    contracts/            # capabilities.ts, provider.ts, agent.ts  (zero deps)
    providers/
      anthropic/          # AnthropicProvider (default) — chat, vision, prompt-cache
      openai/             # OpenAiProvider — chat, vision, embeddings
      google/             # GoogleProvider — Gemini chat/vision, 1M-context batching
    router/               # selection policy, fallback chain, rate-limit buckets
    cache/                # exact + semantic cache, prompt-cache breakpoint logic
    cost/                 # cost calculator, ai.usage emitter
    guardrails/           # schema validate, injection guard, redaction, credit guard, DOMPurify
    observability/        # otel spans, metrics, structured logger
    orchestration/        # agent base, tool registry, run loop, handoffs
    config/               # models.json loader (Doppler), aliases, fallback chains
    index.ts              # AiCoreService (the only public surface callers import)
  test/
```

`AiCoreService` is provided by a NestJS `AiCoreModule` (global), injected anywhere via DI. The worker app (`apps/worker`) and API app (`apps/api`) both consume it.

---

## 11. Key Design Decisions (this layer)

| # | Decision | Why |
|---|----------|-----|
| AC-1 | Callers reference **feature aliases**, never raw model IDs | Roll models forward via config; survive deprecations (Gemini 2.0 shutdown lesson) |
| AC-2 | Cost computed **inside** the abstraction from the registry | Single source of truth; callers can't under/over-report; billing trusts one number |
| AC-3 | **Tiered routing** Gemini-first, Claude/Opus fallback | 10x cheaper first pass, premium only on low confidence (extraction research) |
| AC-4 | Two cache layers (provider prompt-cache + our exact/semantic) | Prompt-cache cuts multi-batch input spend ~25-40%; exact cache zeroes deterministic repeats |
| AC-5 | `ai.usage` event on **every** call incl. cache hits | Billing/credits/analytics impossible without it (architecture finding) |
| AC-6 | Guardrails (schema, injection, redaction, credit guard, DOMPurify, human gate) live **in the layer** | Can't be forgotten per-caller; security findings demand it |
| AC-7 | Agents orchestrate via **BullMQ handoffs**, not sync calls | Idempotency, back-pressure, independent scaling |
| AC-8 | Default provider **Anthropic Claude** (D-005); OpenAI + Gemini first-class | Proposal requirement; vendor flexibility + fallback |

---

## 12. Open Questions / Deferred

- **Image-generation capability** (theme/store-builder P3) — add a 4th capability `image` behind the same factory; provider set differs (likely Gemini/Imagen, OpenAI gpt-image). Deferred to P3.
- **Self-hosted/edge models** (CLIP, YOLO, Tesseract) — these run *outside* `ai-core` as plain worker utilities (no token billing); only the vision-embedding adapter for CLIP is registered as an `embedding` capability so dedup uses the uniform interface.
- **Fine-tuned extraction model** — once we have labeled draft-vs-corrected data (from the human review gate), a fine-tuned small model could replace some Gemini calls. Revisit P4+.
- **Semantic-cache poisoning** — guard threshold (0.97) chosen conservatively; monitor false-reuse rate before loosening.
