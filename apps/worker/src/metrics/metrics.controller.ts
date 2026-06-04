import { Controller, Get, Header } from '@nestjs/common';
import { MetricsService } from './metrics.service';

/**
 * Prometheus scrape endpoint for the worker (`GET /metrics` on the worker port).
 * Renders the shared {@link MetricsService} registry — default Node/process
 * metrics plus AICOS queue-depth gauges + lifecycle counters.
 */
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  scrape(): Promise<string> {
    return this.metrics.render();
  }
}
