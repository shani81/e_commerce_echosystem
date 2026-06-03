import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { BILLING_JOBS, QUEUE_NAMES, type StripeEventJobData } from './contracts';
// Runtime (value) imports — Nest's DI needs the class references in the emitted
// decorator metadata to resolve these constructor injections.
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

/**
 * Consumer for the `billing` queue. The API verifies a Stripe webhook signature
 * synchronously, then hands the verified event off here as a `stripe.event` job
 * so the HTTP handler returns 200 fast and side-effects retry independently.
 *
 * IDEMPOTENCY: Stripe redelivers events. `jobId = eventId` dedupes while the job
 * exists; this processor also records a processed-event marker in Redis so a
 * redelivery arriving AFTER the original job was evicted is still skipped. The
 * marker is set only AFTER successful processing, so a failed attempt still
 * retries (BullMQ re-runs the same job).
 *
 * PHASE 0: stub. It logs and acks; it makes NO Stripe API calls and writes no
 * billing rows. Real subscription/invoice sync (via `prisma.withSystem`) lands
 * in the billing phase.
 */
@Processor(QUEUE_NAMES.billing)
export class BillingProcessor extends WorkerHost {
  private readonly logger = new Logger(BillingProcessor.name);
  private static readonly DONE_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {
    super();
  }

  async process(
    job: Job<StripeEventJobData>,
  ): Promise<{ handled: boolean; idempotentSkip?: boolean }> {
    if (job.name !== BILLING_JOBS.stripeEvent) {
      // Unknown job name on this queue — ack without acting so a stray enqueue
      // never wedges the worker. Real code would alert here.
      this.logger.warn(`billing ignoring unknown job name="${job.name}" id=${job.id}`);
      return { handled: false };
    }

    const { eventId, type, tenantId } = job.data;
    const doneKey = `stripe:evt:${eventId}:done`;

    if ((await this.redis.client.exists(doneKey)) === 1) {
      this.logger.log(
        `billing stripe.event ${eventId} already processed — skipping (idempotent)`,
      );
      return { handled: true, idempotentSkip: true };
    }

    // PHASE 0 stub — no Stripe call, no rows written; the no-op is trivially
    // idempotent. The marker below makes future, effectful handlers idempotent.
    void this.prisma;
    this.logger.log(
      `billing stripe.event id=${job.id} event=${eventId} type=${type} tenant=${tenantId ?? 'unknown'} — phase 0 stub`,
    );

    await this.redis.client.set(doneKey, '1', 'EX', BillingProcessor.DONE_TTL_SECONDS);
    return { handled: true };
  }
}
