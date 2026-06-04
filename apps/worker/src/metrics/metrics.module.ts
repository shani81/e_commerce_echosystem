import { Module } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { MetricsController } from './metrics.controller';

/**
 * Worker Prometheus metrics. Owns the registry + business/queue metric objects;
 * exported so the queue processors + the queue-depth collector can record into
 * the same registry the `/metrics` controller renders.
 */
@Module({
  controllers: [MetricsController],
  providers: [MetricsService],
  exports: [MetricsService],
})
export class MetricsModule {}
