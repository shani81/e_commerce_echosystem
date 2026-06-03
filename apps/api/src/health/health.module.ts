import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { BullModule } from '@nestjs/bullmq';
import { HealthController } from './health.controller';
import { PrismaHealthIndicator } from './prisma.health';
import { RedisHealthIndicator } from './redis.health';
import { BILLING_QUEUE } from '../billing/billing.constants';

/**
 * Health module — Terminus-based liveness/readiness with custom Prisma and Redis
 * indicators. Re-registers the `billing` queue so the Redis indicator can borrow
 * its connection for the PING probe.
 */
@Module({
  imports: [
    TerminusModule,
    BullModule.registerQueue({ name: BILLING_QUEUE }),
  ],
  controllers: [HealthController],
  providers: [PrismaHealthIndicator, RedisHealthIndicator],
})
export class HealthModule {}
