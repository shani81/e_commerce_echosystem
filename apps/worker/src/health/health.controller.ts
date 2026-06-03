import { Controller, Get } from '@nestjs/common';

/** Shape returned by `GET /health`. */
interface HealthStatus {
  status: 'ok';
  service: 'worker';
  uptime: number;
  timestamp: string;
}

/**
 * Liveness endpoint for the worker on port 4100. Intentionally trivial — it
 * reports the process is up so an orchestrator (K8s/compose) can probe it. The
 * real work happens on the BullMQ queues, not over HTTP.
 */
@Controller('health')
export class HealthController {
  @Get()
  check(): HealthStatus {
    return {
      status: 'ok',
      service: 'worker',
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}
