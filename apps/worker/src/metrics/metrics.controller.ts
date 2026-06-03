import { Controller, Get, Header, type OnModuleInit } from '@nestjs/common';
import { collectDefaultMetrics, Registry } from 'prom-client';

/**
 * Prometheus scrape endpoint for the worker (`GET /metrics` on the worker port).
 * Exposes default Node/process metrics — CPU, memory, event-loop lag, GC — so an
 * orchestrator can watch worker health beyond the liveness probe.
 */
@Controller('metrics')
export class MetricsController implements OnModuleInit {
  private readonly registry = new Registry();

  onModuleInit(): void {
    this.registry.setDefaultLabels({ app: 'aicos-worker' });
    collectDefaultMetrics({ register: this.registry });
  }

  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  scrape(): Promise<string> {
    return this.registry.metrics();
  }
}
