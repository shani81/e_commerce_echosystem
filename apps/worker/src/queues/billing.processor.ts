import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import {
  BILLING_JOBS,
  QUEUE_NAMES,
  type StripeEventJobData,
} from './contracts';
// Runtime import (NOT `import type`): Nest's DI needs the class reference in the
// emitted decorator metadata to resolve this constructor injection.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from '../prisma/prisma.service';

/**
 * Consumer for the `billing` queue. The API verifies a Stripe webhook
 * signature synchronously, then hands the event off here as a `stripe.event`
 * job so the HTTP handler can return 200 fast and the side-effects retry
 * independently.
 *
 * PHASE 0: stub. It logs and acks; it makes NO Stripe API calls and writes no
 * billing rows. Real handling (subscription/invoice sync via `withSystem`) lands
 * in the billing phase.
 */
@Processor(QUEUE_NAMES.billing)
export class BillingProcessor extends WorkerHost {
  private readonly logger = new Logger(BillingProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<StripeEventJobData>): Promise<{ handled: boolean }> {
    if (job.name !== BILLING_JOBS.stripeEvent) {
      // Unknown job name on this queue — ack without acting so a stray enqueue
      // never wedges the worker. Real code would alert here.
      this.logger.warn(`billing ignoring unknown job name="${job.name}" id=${job.id}`);
      return { handled: false };
    }

    const { eventId, type, tenantId } = job.data;

    // Stripe redelivers webhooks; `eventId` (evt_...) is the idempotency key.
    // A real handler checks a processed-events table under `withSystem` before
    // applying effects. The stub is a pure no-op, so it is already idempotent.
    void this.prisma;

    this.logger.log(
      `billing stripe.event received id=${job.id} event=${eventId} type=${type} tenant=${tenantId ?? 'unknown'} — phase 0 stub (no Stripe call)`,
    );

    return { handled: true };
  }
}
