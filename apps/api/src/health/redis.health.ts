import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { HealthIndicator, type HealthIndicatorResult } from '@nestjs/terminus';
import type { Queue } from 'bullmq';
import { BILLING_QUEUE } from '../billing/billing.constants';

/**
 * Readiness check for Redis. Reuses the BullMQ queue's ioredis connection (the
 * same Redis the workers depend on) and issues a `PING`, avoiding a second
 * standalone client.
 */
@Injectable()
export class RedisHealthIndicator extends HealthIndicator {
  constructor(
    @InjectQueue(BILLING_QUEUE) private readonly queue: Queue,
  ) {
    super();
  }

  async pingCheck(key: string): Promise<HealthIndicatorResult> {
    try {
      // queue.client resolves to the underlying ioredis connection. BullMQ types
      // it as a minimal interface (no `ping`), so narrow to the method we use.
      const client = (await this.queue.client) as unknown as {
        ping: () => Promise<string>;
      };
      const pong = await client.ping();
      const healthy = pong === 'PONG';
      return this.getStatus(key, healthy, healthy ? undefined : { pong });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      return this.getStatus(key, false, { message });
    }
  }
}
