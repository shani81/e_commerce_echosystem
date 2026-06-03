# AICOS — User Journeys

> **Product:** AI Commerce OS (AICOS)
> **Document status:** Phase 0 (Planning)
> **Last updated:** 2026-06-03

The flagship **< 15-minute onboarding journey** end-to-end, plus daily-use journeys per persona.

---

## 1. THE FLAGSHIP JOURNEY — Film → Publish in < 15 Minutes

**Persona:** Store Owner (non-technical). **North-star metric:** Time-to-Live-Store (TTLS) < 15 min for a 100-SKU store.

### Timeline

| Min | Step | What the owner does | What AICOS does (modules) | The magic / safeguard |
|---|---|---|---|---|
| 0:00 | **Sign up** | Enters email, store name; picks Free or a plan | `iam` provisions tenant (shared schema, `tenant_id`, RLS); `billing` creates Stripe customer; Stripe Connect account drafted via Accounts v2 | One screen, no config |
| 1:00 | **Film guidance** | Opens mobile capture; sees real-time filming guidance | App enforces 1080p min, 20-min max; Laplacian blur detection + pace warnings | Guidance gates accuracy *before* upload — protects the 70% auto-fill rate |
| 2:00 | **Record & upload** | Films shelves (a few minutes), uploads | Multipart upload direct to R2 (10MB chunks) → `VideoIngestWorker` enqueued (BullMQ, deterministic jobId) | No waiting on a laptop; phone does it all |
| 3:30 | **Extraction runs** | Waits (gets a notification) | Pipeline: FFmpeg keyframes + pHash dedup → **ZXing barcode pass** (auto-fills 20–40% via Open Food Facts, $0 LLM) → **Gemini 2.5 Flash** batched 8 frames/call → **Claude Sonnet 4.6** fallback (<0.6 conf) → CLIP/pgvector dedup | 75–110s with 10 concurrent workers; ~$0.10–$0.15 cost |
| 5:00 | **Draft catalog ready** | Notified: "Your catalog is ready to review" | Draft product records created with **per-field confidence scores**; `content` agent drafts descriptions + SEO | Sub-3-min from upload to review |
| 5:00–12:00 | **Review & verify** | Reviews products; triage UI surfaces low-confidence + missing fields (e.g., occluded prices); merges size variants; edits as needed | Confidence-driven triage; merge/split actions; price-format regex + cross-frame agreement flag anomalies | **HUMAN VERIFICATION GATE — nothing is live yet** |
| 12:00 | **Pick look** | Chooses a theme (or accepts AI default) | `theme-engine`/defaults; storefront scaffold ready | Looks like a real store instantly |
| 13:00 | **Connect payments** | Taps "Get paid"; completes Stripe AccountLink | `payments` finalizes Connect onboarding (Stripe-hosted KYC); `automatic_tax` on | No custom KYC; Stripe handles SCA/tax |
| 14:00 | **PUBLISH** | Reviews summary, taps **Publish** | **Only on explicit click** (JOB 6): catalog indexed to Meilisearch, storefront goes live, sitemap queued | Human-gated publish is architecturally enforced |
| **< 15:00** | **Live & selling** | Shares the link | Store is transactable; search live; checkout via Stripe | **North star achieved** |

### Critical Safeguards in This Journey
- **Nothing AI-generated auto-publishes.** Publish (JOB 6) is triggered *only* by explicit user action — enforced in architecture, not policy.
- **Confidence scoring drives the review UI** to minimize owner effort (fix the few uncertain fields, accept the rest).
- **Fallback paths at launch:** photo-batch capture (for owners who won't film), and done-for-you onboarding (concierge).
- **Failure modes handled:** motion blur (~40% of amateur videos) → guidance + reshoot prompts; occluded prices (~30% of shelf segments) → flagged for manual entry, never guessed; hallucination (2–5%) → schema validation + human gate.

---

## 2. Daily-Use Journey — Store Owner (post-launch)

**Goal:** run and grow the store from a phone with minimal effort.

1. **Morning check (1 min):** Dashboard shows yesterday's orders, GMV, low-stock alerts, AI agent suggestions.
2. **Add new stock:** Films a new shelf → same extraction pipeline → reviews → publishes additions. Re-uses the magic for every restock.
3. **Approve AI suggestions:** Marketing Agent drafts a promo; Pricing Agent suggests a markdown; Inventory Agent flags reorder — **owner approves/declines** (human gate everywhere, P4).
4. **Handle exceptions:** Responds to a flagged order or a customer-service draft from the CS Agent.
5. **Grow:** Reviews analytics/BI; connects Google (Merchant/GBP/GA4) to drive traffic.

> Expansion levers (AI credits, GMV, agents) surface naturally as the owner succeeds — driving net revenue retention.

---

## 3. Daily-Use Journey — Store Manager

1. **Inventory control:** Reviews stock across location(s); bulk-edits prices/quantities; sets reorder points.
2. **Order operations:** Processes orders, prints/buys shipping labels (Shippo; Bring/PostNord for Nordics), updates fulfillment status — `ShipmentRecord` cached to R2.
3. **Catalog upkeep:** Fixes/edits products; runs new extractions; manages variants and categories.
4. **Oversight:** Uses audit trail to see staff changes; assigns roles; monitors search quality and synonyms.
5. **Forecasting (P4):** Acts on AI inventory forecasting to avoid stockouts before peak periods.

---

## 4. Daily-Use Journey — Store Staff

1. **Login → task list:** Sees only assigned tasks (RBAC-scoped; no pricing/financials).
2. **Fulfill orders:** Picks/packs, scans barcodes, marks fulfilled on mobile.
3. **Update stock:** Adjusts quantities as items sell or arrive; flags discrepancies to manager.
4. **Notifications:** Receives task pings (email/chat); cannot access anything outside scope (enforced by RLS, not just UI).

---

## 5. Daily-Use Journey — End Customer (Shopper)

1. **Discover:** Finds store via Google Shopping/Maps/GBP/social (P4 sync) or direct link.
2. **Browse & search:** Fast storefront; multilingual Meilisearch queried directly via 1-hour tenant token (frontend bypasses API in the hot path).
3. **Add to cart → checkout:** Stripe Checkout embedded — SCA/3DS, tax, promos, shipping address all handled; SAQ A compliant page.
4. **Pay:** Funds route to tenant via destination charge; AICOS takes optional `application_fee_amount`.
5. **Post-purchase:** Order confirmation + tracking (email/chat); manages orders/returns in the customer portal.

---

## 6. Daily-Use Journey — Platform Super Admin (internal)

1. **Health & SLA:** Watches observability dashboards; KEDA scales BullMQ workers on queue depth to hold the 15-min SLA under video load.
2. **Cost governance:** Monitors `ai.usage` per tenant; credit guards + BullMQ limiter prevent cost bombs; reviews AI gross margin.
3. **Security:** Verifies RLS posture (FORCE RLS, transaction-scoped `set_config`, `security_invoker` views), patched Postgres (16.9+), secret rotation; investigates abuse/fraud.
4. **Reliability:** Manages AI provider fallback chain (Gemini→Claude→OpenAI); handles webhook idempotency (Stripe/Shippo via BullMQ).
5. **Compliance:** Operates DSAR endpoints + nightly retention job; reviews audit logs.

---

## 7. Daily-Use Journey — Agency / White-Label Reseller (P5)

1. **Branded console:** Logs into AICOS under her own brand (white-label).
2. **Onboard a client:** Films or coordinates filming for a client → extraction → review → publish, under the agency brand. Minutes per client.
3. **Manage portfolio:** Switches between client sub-tenants from one console; applies themes; configures integrations.
4. **Bill clients:** Reseller billing / revenue-share runs through `billing`; transparent margin.
5. **Grow book of business:** Adds integrations from the marketplace; scales seat/tenant count.

---

## 8. Journey Design Principles
- **The onboarding journey is the product.** Protect its step-count and TTLS above all.
- **Human gate at every AI decision point.** Extraction, content, themes, agent actions — all reviewable, none auto-applied.
- **Mobile-first for shop-floor personas** (Owner/Manager/Staff) and shoppers.
- **Re-use the magic:** the same film→review→publish loop powers restocking, not just first launch.
- **Degrade gracefully:** photo-batch and done-for-you fallbacks ensure no owner is blocked by the camera.
