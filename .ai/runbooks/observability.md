# Runbook — Perf & Observability (Phase 2 · P2.4)

## Scrape endpoints
- **API** — `GET http://localhost:4000/metrics` (excluded from the `api/v1` prefix).
- **Worker** — `GET http://localhost:4100/metrics` (worker port).

Point Prometheus at both; load `ops/prometheus/alerts.yml` as a rule file.

## Metric catalogue
| Metric | Type | Where | Use |
|--------|------|-------|-----|
| `http_request_duration_seconds` | histogram (`method,route,status`) | api | latency p50/p95, throughput, **5xx error rate** |
| `aicos_queue_depth{queue,state}` | gauge | worker | BullMQ backlog — `waiting`/`active`/`delayed`/`completed`/`failed` per queue (extraction, billing, notifications, dsar) |
| `aicos_orders_paid_total` | counter | worker | orders flipped to PAID (business throughput) |
| `aicos_notifications_total{status}` | counter | worker | transactional email `sent`/`failed` — drives the failure-rate alert |
| `aicos_dsar_processed_total{type}` | counter | worker | GDPR DSAR fulfilment (export/erasure) |
| `process_*`, `nodejs_*` | gauges | api + worker | CPU, RSS/heap, event-loop lag, GC (prom-client defaults) |

The queue-depth gauges are sampled every 10s by `QueueMetricsService` (worker);
the counters are incremented in the queue processors.

## Alerts (`ops/prometheus/alerts.yml`)
- **QueueBacklogHigh / QueueFailuresHigh** — `waiting`/`failed` jobs piling up.
- **NotificationFailureRateHigh** — email failure rate > 10% (SMTP/provider issue).
- **ApiHighErrorRate** — 5xx rate > 5%.
- **ApiLatencyP95High** — p95 > 1s.

## Dashboards
Build a Grafana dashboard from the metrics above. Starter panels/queries:
- API p95 latency: `histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))`
- API RPS by status: `sum(rate(http_request_duration_seconds_count[1m])) by (status)`
- Queue backlog: `aicos_queue_depth{state="waiting"}` by `queue`
- Orders paid/min: `rate(aicos_orders_paid_total[5m]) * 60`

## Load testing (k6)
`perf/k6/storefront.js` ramps to 10 VUs browsing the storefront with thresholds
(`p95 < 500ms`, `error rate < 1%`):
```
k6 run perf/k6/storefront.js
# or:  API_URL=http://localhost:4000 STORE_SLUG=demo k6 run perf/k6/storefront.js
```
**Raise the API rate limit** for the instance under test (the 200/min/IP global
throttle exists to protect prod and will return 429 under sustained load) — or
drive from multiple source IPs.

## DB index review
Reviewed the hot query paths against the Prisma schema; coverage is in place:
| Query path | Index |
|-----------|-------|
| Tenant-scoped lists (orders/returns/products/…) | `@@index([tenantId])` + `@@index([tenantId, createdAt])` on every aggregate model |
| Orders by status (admin filter) | `@@index([tenantId, status])` on `Order` |
| Storefront product browse (ACTIVE) | `@@index([tenantId])` + `status` filter; search served by Meilisearch |
| Cart / session / order lookups | `@unique` on `Cart.token`, `Order.(tenantId,number)`, `Session.id`, `Payment.stripePaymentIntentId` |
| Shipment tracking | `@@index([trackingNumber])` |
| Stock ledger | `@@index([inventoryItemId])`, `@@index([tenantId, createdAt])` |

**Recommendations / watch-list (add when load data warrants):**
- `ProductVariant(tenantId, sku)` is unique (lookup-fast); consider an index on
  `InventoryItem(variantId)` if restock/decrement fan-out grows (currently
  filtered by `variantId` which is part of `@@unique([variantId, locationId])`).
- Revisit composite indexes for any slow query surfaced by `pg_stat_statements`
  once there's production traffic.
