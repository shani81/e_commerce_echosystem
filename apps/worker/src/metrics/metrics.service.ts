import { Injectable, type OnModuleInit } from '@nestjs/common';
import { collectDefaultMetrics, Counter, Gauge, Registry } from 'prom-client';

/**
 * Owns the Prometheus registry for the worker process: default Node/process
 * metrics plus AICOS business + queue observability. Scraped at `GET /metrics`
 * (worker port). Queue-depth gauges are fed by {@link QueueMetricsService};
 * the lifecycle counters are incremented by the queue processors.
 */
@Injectable()
export class MetricsService implements OnModuleInit {
  readonly registry = new Registry();

  /** BullMQ backlog: jobs per queue, broken down by state. */
  readonly queueDepth: Gauge<'queue' | 'state'>;
  /** Orders flipped to PAID by the billing processor. */
  readonly ordersPaid: Counter<string>;
  /** Notifications processed, by outcome (sent/failed). */
  readonly notifications: Counter<'status'>;
  /** GDPR DSAR requests fulfilled, by type (export/erasure). */
  readonly dsarProcessed: Counter<'type'>;

  constructor() {
    this.registry.setDefaultLabels({ app: 'aicos-worker' });
    this.queueDepth = new Gauge({
      name: 'aicos_queue_depth',
      help: 'BullMQ jobs per queue by state',
      labelNames: ['queue', 'state'],
      registers: [this.registry],
    });
    this.ordersPaid = new Counter({
      name: 'aicos_orders_paid_total',
      help: 'Orders marked PAID by the billing worker',
      registers: [this.registry],
    });
    this.notifications = new Counter({
      name: 'aicos_notifications_total',
      help: 'Transactional notifications processed by outcome',
      labelNames: ['status'],
      registers: [this.registry],
    });
    this.dsarProcessed = new Counter({
      name: 'aicos_dsar_processed_total',
      help: 'GDPR DSAR requests fulfilled by type',
      labelNames: ['type'],
      registers: [this.registry],
    });
  }

  onModuleInit(): void {
    collectDefaultMetrics({ register: this.registry });
  }

  render(): Promise<string> {
    return this.registry.metrics();
  }

  get contentType(): string {
    return this.registry.contentType;
  }
}
