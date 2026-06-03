# AICOS Complexity Map

> Where the hard problems live: per-module complexity, critical paths, bottlenecks, and an overall complexity score.
> Used to focus review effort, sequence work, and set risk-adjusted estimates. Phase 0 — all modules Planned/0%.

---

## 1. Per-module complexity scoring

Each module scored 1–10 on four axes; **Total** = weighted (Tech 35% / Integration 30% / Risk 25% / Coupling 10%), normalized to 1–10.

| Module | Tech | Integration | Risk | Coupling | **Total** | Why |
|---|---|---|---|---|---|---|
| `ai-extraction` ★ | 10 | 8 | 10 | 8 | **9.4** | Multi-model staged vision pipeline, FFmpeg, pgvector dedup, confidence scoring, idempotent BullMQ fan-out, hallucination/blur failure modes. The single hardest asset. |
| `payments` | 7 | 10 | 9 | 7 | **8.4** | Stripe Connect Accounts v2 (new Dec 2025), destination charges, **platform chargeback liability**, refunds debit platform, Tax, webhook HMAC. Money + irreversibility. |
| `google` | 6 | 10 | 8 | 6 | **7.7** | 8 API families, separate approvals, OAuth verification (4–8 wks), partial-grant handling, **Content API hard shutdown Aug 18 2026**, per-tenant token vault. |
| `ai-core` | 8 | 7 | 7 | 9 | **7.6** | Provider routing/fallback, schema validation, rate-limit/backoff, usage metering. Everything AI depends on it → high blast radius. |
| `iam` | 7 | 4 | 9 | 9 | **7.3** | RLS correctness, transaction-local context, PgBouncer mode, RBAC, JWT rotation. Bugs here = cross-tenant leak (Critical). Foundation of all. |
| `billing` | 6 | 8 | 7 | 8 | **7.0** | Stripe Billing 0.7%, AI-credit ledger, metered usage, entitlements, AiCreditGuard. Revenue-protecting; couples to every AI module. |
| `store-builder` | 8 | 5 | 6 | 6 | **6.6** | Name→full store generation, visual cloning (legal nuance), layout assembly across catalog/theme/content. |
| `orders` | 6 | 5 | 7 | 8 | **6.3** | Status machine, returns/refunds, **split-payment-ready data model** from day one, inventory coupling. |
| `pricing` | 7 | 4 | 6 | 6 | **5.9** | Demand/competitor/margin modeling; advisory-only gate; couples analytics+catalog+inventory. |
| `marketing` | 6 | 7 | 5 | 5 | **5.8** | 4 ad channels (Meta/TikTok/Pinterest/Google Ads), creative gen, feed mapping; Google Ads audit gate. |
| `inventory` | 5 | 3 | 7 | 7 | **5.4** | Reservations, oversell prevention, concurrency under purchase load. |
| `automation` | 6 | 4 | 5 | 8 | **5.4** | Trigger→condition→action graph touching many modules; runaway-loop risk. |
| `theme-engine` | 7 | 3 | 4 | 5 | **5.1** | Design-token generation, render into storefront; mostly self-contained. |
| `customer-service` | 6 | 4 | 5 | 5 | **5.0** | Grounded assistant, escalation, hallucination control on live customers. |
| `content` | 5 | 4 | 5 | 5 | **4.7** | AI copy/SEO; **DOMPurify XSS gate**; depends on ai-core. |
| `analytics` | 5 | 5 | 4 | 5 | **4.7** | Event pipeline, dashboards, forecasting inputs, GA4 reconcile. |
| `shipping` | 4 | 6 | 5 | 5 | **4.8** | Provider interface, Shippo→PostNord, label cache/expiry, Nordic carriers. |
| `storefront` | 5 | 4 | 4 | 6 | **4.6** | Public BFF, Meili-direct search, theme application, SEO surfaces. |
| `customers` | 4 | 3 | 6 | 5 | **4.3** | Portal + **GDPR DSAR (export/erase)**, consent; separate from platform Users. |
| `search` | 4 | 4 | 4 | 5 | **4.1** | Meili sync, tenant tokens, 10-word limit handling, faceting. |
| `media` | 4 | 5 | 4 | 5 | **4.3** | Pre-signed multipart, transforms, `temp/` 48h lifecycle, R2/MinIO parity. |
| `admin` | 4 | 3 | 4 | 6 | **4.0** | Aggregation BFF; houses the review-gate UI (UX-heavy, low tech risk). |
| `notifications` | 3 | 4 | 3 | 4 | **3.4** | Email send/templates; lowest backend risk. |
| `catalog` | 5 | 3 | 5 | 8 | **5.0** | Variant matrix, draft/published lifecycle. Tech-moderate but **highest coupling** — extraction/search/orders/content all read it. |

★ flagship.

---

## 2. Critical paths

### CP-1 — The north-star magic (P2, highest value + highest risk)
```
media(upload) → ai-extraction(JOB1-5) → content → ★human gate★ → ai-extraction(JOB6 publish)
              → catalog → inventory → media → search(reindex) → storefront live
```
Bottleneck: **JOB3 frame-analyze** (AI latency/cost) and the **human review UX** (owner effort). Both directly gate the <15-min SLA. Mitigations: 10 concurrent FrameAnalysisWorkers, Gemini batch-8, ZXing pre-fill, confidence-driven triage.

### CP-2 — Money in (P1, irreversible)
```
storefront(cart) → payments(Checkout/Connect) → Stripe → webhook → orders → inventory → shipping → notifications
```
Bottleneck: **Stripe webhook correctness** (rawBody HMAC, replay dedup) and **chargeback/refund accounting** on the platform balance. Failures here lose money or double-fulfill.

### CP-3 — Tenant trust root (P0, pervasive)
```
iam(RLS + tenant context) ⟶ EVERY tenant-scoped query in EVERY module
```
Bottleneck: **`withTenant` discipline + PgBouncer transaction pooling**. A single session-scoped `set_config` anywhere breaks isolation for all subsequent pooled connections. Mitigation: architecturally enforce the single DB entry path; lint/review gate.

### CP-4 — Google feed deadline (P4, time-boxed)
```
google(OAuth verify in P3) → Merchant API v1 → product feed live BEFORE Aug 18 2026
```
Bottleneck: **OAuth verification (4–8 wks) + GBP 60-day age**. Must start in P3. Hard external deadline.

---

## 3. System bottlenecks & where they bite

| Bottleneck | Where | Symptom | Mitigation |
|---|---|---|---|
| AI frame analysis latency/cost | `ai-extraction` JOB3 | misses 15-min SLA; cost blowout | Gemini batch-8, 10 concurrent workers, ZXing pre-fill, Claude only on <0.6 |
| BullMQ queue starvation under video load | worker tier | extraction backs up | **KEDA queue-depth autoscaling** (not CPU HPA) |
| FFmpeg memory spike (4K/long video) | `keyframe` worker | pod OOMKilled | enforce max resolution + 20-min cap at upload |
| RLS context leak via pool reuse | `iam`/Prisma/PgBouncer | **cross-tenant data exposure** | `set_config(...,TRUE)` in `$transaction`; transaction pooling; `FORCE RLS` |
| Stripe webhook rawBody corruption | `payments` | HMAC silently fails forever | `rawBody:true` at bootstrap; no JSON middleware on webhook route |
| AI cost bomb (abuse/compromise) | `ai-core`/`billing` | $5k+/hr burn | AiCreditGuard + BullMQ limiter + Throttler (3 layers) |
| Meili 10-word query limit | `search` | long queries silently truncated | inform users / split queries in UI |
| Google OAuth verification delay | `google` | P4 launch blocked | submit in P3; ≤100 test users |
| Label URL expiry | `shipping` | broken label links | cache `labelUrl` to S3/R2 on creation |
| `temp/` frame accumulation | `media` | storage fills (300+ JPEGs/video) | 48h lifecycle expiry rule |

---

## 4. Coupling hotspots (high blast radius — change carefully)
1. **`catalog`** — read by extraction, search, orders, content, pricing, marketing, storefront, google. Schema changes ripple widely.
2. **`iam`/tenant context** — every module depends on it; the `withTenant` seam is load-bearing.
3. **`ai-core`** — every AI module routes through it; provider/schema changes affect all agents.
4. **`billing` entitlements + AiCreditGuard** — gate every AI-consuming action.

---

## 5. Phase complexity profile

| Phase | Avg module complexity | Dominant risk | Notes |
|---|---|---|---|
| P0 Foundation | 7.0 | RLS correctness, billing/credit scaffolding | Small module count, very high per-module risk — get it right or everything inherits the bug |
| P1 Core Commerce | 5.4 | Stripe money flows, order/inventory concurrency | Most modules; breadth-heavy |
| P2 The Magic | 7.2 | Extraction pipeline + AI cost + human gate | Highest single-module complexity (`ai-extraction` 9.4) |
| P3 Store Builder | 5.9 | Generative quality, visual-cloning legality | Builds on stable P1/P2 |
| P4 Growth | 6.0 | Google approvals/deadline, ad-channel sprawl | Integration-heavy, externally time-boxed |
| P5 Scale | 5.4 | Multi-region, K8s, compliance, white-label | Operational complexity > code complexity |

---

## 6. Overall platform complexity score

**Weighted overall complexity: 7.1 / 10 — HIGH.**

Drivers: (1) a genuinely novel, accuracy-critical AI vision pipeline with no incumbent to copy; (2) multi-tenant isolation that must be perfect at million-tenant scale; (3) platform-liability money flows via Stripe Connect; (4) an 8-family Google integration with a hard external shutdown deadline. Tempering factors: a locked, well-understood stack; research-validated architecture decisions; phased delivery that sequences risk; and a modular monolith that defers distribution complexity.

**Implication:** concentrate senior review on `iam` (P0), `payments` (P1), and `ai-extraction` (P2) — these three carry ~60% of the platform's Critical-severity risk. Everything else is breadth, not depth.
