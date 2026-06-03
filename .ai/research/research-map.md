# Research Map — AICOS

Connects research dossiers to the features, decisions, and risks they inform. **Search this map before re-researching a topic.** Dossiers live under `.ai/research/`.

| Research dossier | Informs features / modules | Drives decisions | Surfaced risks |
|------------------|----------------------------|------------------|----------------|
| [`competitors/findings.md`](competitors/findings.md) | Positioning, store-builder, onboarding UX | D-001 (general e-commerce domain); "human gate as a marketable feature" | Incumbent (Shopify Sidekick / Google Lens) copies video-to-catalog; owner reluctance to film |
| [`ai/extraction-feasibility.md`](ai/extraction-feasibility.md) | ai-extraction ★, ai-core, content, inventory estimation | Gemini-first + Claude fallback; ZXing+Open Food Facts zero-cost path; 60-80 frame sampling; confidence triage | Motion blur (~40%), occluded prices (~30%), LLM hallucination (2-5%), per-video cost blow-out, model deprecation |
| [`google/findings.md`](google/findings.md) | google, analytics, content (SEO), storefront | Merchant **API v1** only (Content API dies 2026-08-18); submit OAuth verification in P3; GA4 Measurement Protocol server-side | Content API hard shutdown, OAuth verification delay, GBP approval denial, Measurement Protocol abuse, Maps key exposure |
| [`integrations/payments-shipping.md`](integrations/payments-shipping.md) | payments, shipping, orders, billing | Stripe Connect destination charges + Tax + Checkout (SAQ A); Shippo P1 → PostNord direct P2 | Connect chargeback liability on platform, refund debits platform, Stripe Billing 0.7% fee, PostNord absent from EasyPost, gift-card ledger scope |
| [`architecture/findings.md`](architecture/findings.md) | iam, all backend modules, ai-extraction worker, search, media | Shared DB + RLS multi-tenancy; NestJS modular monorepo; BullMQ worker split; Meilisearch over Typesense; R2/MinIO | PgBouncer `SET SESSION` leak, RLS bypass via SECURITY DEFINER/view, BullMQ starvation, FFmpeg OOM, AI provider outage |
| [`security/findings.md`](security/findings.md) | iam, payments, ai-core, customers (GDPR), cross-cutting | FORCE RLS + transaction-local context + `withTenant`; PG ≥16.9; AiCreditGuard; CSP for PCI 11.6.1; webhook signature+replay defense | Cross-tenant leak via pool, CVE-2025-8713 (<16.9), AI cost bomb, GDPR Schrems II, webhook replay, Stripe raw-body corruption, Meili master-key exposure, JWT in localStorage |

## Research → Strategic decisions (traceability)
- **D-001** general e-commerce domain ← competitors (larger physical-retail TAM than restaurants).
- **D-003** Meilisearch over Typesense ← architecture (ops simplicity, multilingual, tenant tokens).
- **D-005** Claude-default behind abstraction; Gemini-first extraction ← ai-extraction (10× cost, deprecation protection).
- **D-006** shared-DB + RLS multi-tenancy ← architecture + security (scale to 100k+ tenants, DB-level isolation).
- **D-007** human verification gate ← ai-extraction + competitors (error-rate reality + trust differentiator).

Full decision rationale: `../master-brain/strategic-decisions.md` and `../decisions/decision-log.md`. Risk register: `../master-brain/risk-register.md`.

## Research coverage status (2026-06-03)
6 of 6 planned Phase-0 dossiers complete (competitors, AI extraction, Google, payments/shipping, architecture, security). **Gaps to research before their phase:** i18n/translation pipeline (P2), website-cloning legal/compliance guardrails (P3), KEDA/K8s autoscaling specifics (P5), SOC 2 path (P5).
