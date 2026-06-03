import { Module } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { MetricsController } from './metrics.controller';

/**
 * Prometheus metrics for the API. Exports MetricsService so the globally-bound
 * HttpMetricsInterceptor (see app.module) can record request durations.
 */
@Module({
  controllers: [MetricsController],
  providers: [MetricsService],
  exports: [MetricsService],
})
export class MetricsModule {}
