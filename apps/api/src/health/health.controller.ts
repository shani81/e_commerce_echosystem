import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { Public } from '../common/decorators/public.decorator';
import { PrismaHealthIndicator } from './prisma.health';
import { RedisHealthIndicator } from './redis.health';

/**
 * Health endpoints (→ `/api/v1/health`, `/api/v1/health/ready`). Public so
 * load balancers / k8s probes can reach them without a token.
 *
 *  - `/health`       liveness: process is up (cheap, always 200 while running).
 *  - `/health/ready` readiness: DB + Redis reachable (drains traffic if not).
 */
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prisma: PrismaHealthIndicator,
    private readonly redis: RedisHealthIndicator,
  ) {}

  @Public()
  @Get()
  @HealthCheck()
  live() {
    // Liveness has no external deps — reaching the handler means we're alive.
    return this.health.check([]);
  }

  @Public()
  @Get('ready')
  @HealthCheck()
  ready() {
    return this.health.check([
      () => this.prisma.pingCheck('database'),
      () => this.redis.pingCheck('redis'),
    ]);
  }
}
