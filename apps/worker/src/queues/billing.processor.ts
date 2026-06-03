import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import {
  FinancialStatus,
  OrderStatus,
  PaymentProvider,
  PaymentStatus,
  StockMovementType,
  withSystem,
  withTenant,
  type Prisma,
} from '@aicos/db';
import { BILLING_JOBS, QUEUE_NAMES, type StripeEventJobData } from './contracts';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

// --- Minimal local shapes for the Stripe event objects we read. The worker has
// no `stripe` dependency; the verified event arrives as JSON in the job payload,
// so we type only the fields we touch (defensively — all optional/nullable). ---
interface StripeEventEnvelope {
  type: string;
  data: { object: Record<string, unknown> };
}
interface CheckoutSessionObj {
  id: string;
  payment_intent: string | null;
  amount_total: number | null;
  currency: string | null;
  metadata: Record<string, string> | null;
  total_details?: { amount_tax?: number | null } | null;
}
interface PaymentIntentObj {
  id: string;
  metadata: Record<string, string> | null;
  last_payment_error?: { message?: string } | null;
}
interface ChargeObj {
  id: string;
  payment_intent: string | null;
  currency: string;
  refunds?: { data: StripeRefundObj[] } | null;
}
interface StripeRefundObj {
  id: string;
  amount: number;
  reason?: string | null;
}
interface AccountObj {
  id: string;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  requirements?: {
    currently_due?: string[];
    past_due?: string[];
    disabled_reason?: string | null;
  } | null;
  metadata?: Record<string, string> | null;
}

/**
 * Consumer for the `billing` queue. The API verifies a Stripe webhook signature
 * synchronously, then hands the verified event off here as a `stripe.event` job
 * so the HTTP handler returns 200 fast and side-effects retry independently.
 *
 * IDEMPOTENCY: Stripe redelivers events. `jobId = eventId` dedupes while the job
 * exists; this processor also records a processed-event marker in Redis so a
 * redelivery arriving AFTER the original job was evicted is still skipped. The
 * marker is set only AFTER successful processing, so a failed attempt still
 * retries. Effectful handlers below are ALSO individually idempotent (upserts
 * keyed on Stripe ids), so a marker-less redelivery is still safe.
 *
 * Commerce events handled (M1.3):
 *  - checkout.session.completed → order PAID + Payment + inventory decrement +
 *    cart converted;
 *  - payment_intent.payment_failed → Payment FAILED;
 *  - charge.refunded → Refund rows + financial status (dashboard refunds);
 *  - account.updated → ConnectAccount capability sync.
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
      this.logger.warn(`billing ignoring unknown job name="${job.name}" id=${job.id}`);
      return { handled: false };
    }

    const { eventId, type, payload } = job.data;
    const doneKey = `stripe:evt:${eventId}:done`;

    if ((await this.redis.client.exists(doneKey)) === 1) {
      this.logger.log(
        `billing stripe.event ${eventId} already processed — skipping (idempotent)`,
      );
      return { handled: true, idempotentSkip: true };
    }

    const event = payload as StripeEventEnvelope | undefined;
    const object = event?.data?.object ?? {};

    switch (type) {
      case 'checkout.session.completed':
        await this.onCheckoutCompleted(object as unknown as CheckoutSessionObj);
        break;
      case 'payment_intent.payment_failed':
        await this.onPaymentFailed(object as unknown as PaymentIntentObj);
        break;
      case 'charge.refunded':
        await this.onChargeRefunded(object as unknown as ChargeObj);
        break;
      case 'account.updated':
        await this.onAccountUpdated(object as unknown as AccountObj);
        break;
      default:
        this.logger.log(`billing stripe.event ${eventId} type=${type} — no handler, ack`);
    }

    await this.redis.client.set(doneKey, '1', 'EX', BillingProcessor.DONE_TTL_SECONDS);
    return { handled: true };
  }

  /** Payment captured → flip the order to PAID, write the Payment, decrement stock. */
  private async onCheckoutCompleted(session: CheckoutSessionObj): Promise<void> {
    const tenantId = session.metadata?.tenantId;
    const orderId = session.metadata?.orderId;
    if (!tenantId || !orderId) {
      this.logger.warn(`checkout.session.completed ${session.id} missing tenant/order metadata`);
      return;
    }
    const paymentIntentId =
      typeof session.payment_intent === 'string' ? session.payment_intent : null;
    const amountTotal = session.amount_total ?? null;
    const amountTax = session.total_details?.amount_tax ?? 0;
    const cartToken = session.metadata?.cartToken;

    await withTenant(this.prisma.client, tenantId, async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: orderId, tenantId },
        include: { items: true },
      });
      if (!order) {
        this.logger.warn(`checkout.session.completed: order ${orderId} not found`);
        return;
      }
      if (order.status === OrderStatus.PAID || order.financialStatus === FinancialStatus.PAID) {
        this.logger.log(`order ${order.number} already PAID — skipping`);
        return;
      }

      const paidAmount = amountTotal ?? order.totalCents;
      await tx.order.update({
        where: { id: order.id },
        data: {
          status: OrderStatus.PAID,
          financialStatus: FinancialStatus.PAID,
          placedAt: new Date(),
          taxCents: amountTax,
          totalCents: paidAmount,
          ...(paymentIntentId ? { stripePaymentIntentId: paymentIntentId } : {}),
        },
      });

      if (paymentIntentId) {
        await tx.payment.upsert({
          where: { stripePaymentIntentId: paymentIntentId },
          create: {
            tenantId,
            orderId: order.id,
            provider: PaymentProvider.STRIPE,
            status: PaymentStatus.SUCCEEDED,
            amountCents: paidAmount,
            currency: (session.currency ?? order.currency).toUpperCase(),
            stripePaymentIntentId: paymentIntentId,
            applicationFeeCents: order.applicationFeeCents,
            paidAt: new Date(),
          },
          update: { status: PaymentStatus.SUCCEEDED, amountCents: paidAmount, paidAt: new Date() },
        });
      }

      await this.decrementStock(tx, tenantId, order.id, order.items);

      if (cartToken) {
        await tx.cart.updateMany({
          where: { token: cartToken, convertedOrderId: null },
          data: { convertedOrderId: order.id },
        });
      }

      this.logger.log(`order ${order.number} → PAID (${paidAmount} ${order.currency})`);
    });
  }

  /** Greedily decrement on-hand across the variant's inventory items + ledger it. */
  private async decrementStock(
    tx: Prisma.TransactionClient,
    tenantId: string,
    orderId: string,
    items: { variantId: string | null; quantity: number; productTitle: string }[],
  ): Promise<void> {
    for (const item of items) {
      if (!item.variantId) continue;
      const stocks = await tx.inventoryItem.findMany({
        where: { variantId: item.variantId },
        orderBy: { onHand: 'desc' },
      });
      let remaining = item.quantity;
      for (const stock of stocks) {
        if (remaining <= 0) break;
        const take = Math.min(stock.onHand, remaining);
        if (take <= 0) continue;
        await tx.inventoryItem.update({
          where: { id: stock.id },
          data: { onHand: { decrement: take } },
        });
        await tx.stockMovement.create({
          data: {
            tenantId,
            inventoryItemId: stock.id,
            locationId: stock.locationId,
            type: StockMovementType.SALE,
            quantity: -take,
            reason: 'Order paid',
            refType: 'order',
            refId: orderId,
          },
        });
        remaining -= take;
      }
      if (remaining > 0) {
        this.logger.warn(
          `order ${orderId}: ${remaining}× "${item.productTitle}" sold beyond tracked stock`,
        );
      }
    }
  }

  /** Mark the order's payment FAILED (the order stays open for a retry). */
  private async onPaymentFailed(pi: PaymentIntentObj): Promise<void> {
    const tenantId = pi.metadata?.tenantId;
    const orderId = pi.metadata?.orderId;
    if (!tenantId || !orderId) {
      this.logger.warn(`payment_intent.payment_failed ${pi.id} missing tenant/order metadata`);
      return;
    }
    const reason = pi.last_payment_error?.message ?? 'Payment failed';

    await withTenant(this.prisma.client, tenantId, async (tx) => {
      const order = await tx.order.findFirst({ where: { id: orderId, tenantId } });
      if (!order) return;
      await tx.payment.upsert({
        where: { stripePaymentIntentId: pi.id },
        create: {
          tenantId,
          orderId: order.id,
          provider: PaymentProvider.STRIPE,
          status: PaymentStatus.FAILED,
          amountCents: order.totalCents,
          currency: order.currency,
          stripePaymentIntentId: pi.id,
          failureReason: reason,
        },
        update: { status: PaymentStatus.FAILED, failureReason: reason },
      });
      this.logger.log(`order ${order.number} payment failed: ${reason}`);
    });
  }

  /**
   * Reconcile dashboard-/API-initiated refunds. Resolves the tenant from the
   * Payment (PI is globally unique) then upserts each Stripe refund — keyed on
   * stripeRefundId so a refund already written by the admin endpoint is skipped.
   */
  private async onChargeRefunded(charge: ChargeObj): Promise<void> {
    const paymentIntentId =
      typeof charge.payment_intent === 'string' ? charge.payment_intent : null;
    if (!paymentIntentId) {
      this.logger.warn(`charge.refunded ${charge.id} has no payment_intent`);
      return;
    }

    const payment = await withSystem(this.prisma.client, (tx) =>
      tx.payment.findUnique({
        where: { stripePaymentIntentId: paymentIntentId },
        select: { id: true, tenantId: true, orderId: true, amountCents: true, currency: true },
      }),
    );
    if (!payment) {
      this.logger.warn(`charge.refunded: no payment for PI ${paymentIntentId}`);
      return;
    }

    const refunds = charge.refunds?.data ?? [];
    await withTenant(this.prisma.client, payment.tenantId, async (tx) => {
      let totalRefunded = 0;
      for (const r of refunds) {
        totalRefunded += r.amount;
        const exists = await tx.refund.findUnique({ where: { stripeRefundId: r.id } });
        if (exists) continue;
        await tx.refund.create({
          data: {
            tenantId: payment.tenantId,
            orderId: payment.orderId,
            paymentId: payment.id,
            amountCents: r.amount,
            currency: payment.currency,
            reason: r.reason ?? null,
            stripeRefundId: r.id,
          },
        });
      }
      const fully = totalRefunded >= payment.amountCents;
      await tx.order.update({
        where: { id: payment.orderId },
        data: {
          financialStatus: fully
            ? FinancialStatus.REFUNDED
            : FinancialStatus.PARTIALLY_REFUNDED,
          ...(fully ? { status: OrderStatus.REFUNDED } : {}),
        },
      });
      if (fully) {
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: PaymentStatus.REFUNDED },
        });
      }
      this.logger.log(`order ${payment.orderId} refunded ${totalRefunded} (${refunds.length})`);
    });
  }

  /** Keep the local ConnectAccount mirror in step with Stripe capability state. */
  private async onAccountUpdated(account: AccountObj): Promise<void> {
    let tenantId = account.metadata?.tenantId ?? null;
    if (!tenantId) {
      const existing = await withSystem(this.prisma.client, (tx) =>
        tx.connectAccount.findUnique({
          where: { stripeAccountId: account.id },
          select: { tenantId: true },
        }),
      );
      tenantId = existing?.tenantId ?? null;
    }
    if (!tenantId) {
      this.logger.warn(`account.updated ${account.id}: no tenant mapping`);
      return;
    }

    const requirements: Prisma.InputJsonValue = {
      currentlyDue: account.requirements?.currently_due ?? [],
      pastDue: account.requirements?.past_due ?? [],
      disabledReason: account.requirements?.disabled_reason ?? null,
    };
    await withTenant(this.prisma.client, tenantId, (tx) =>
      tx.connectAccount.updateMany({
        where: { tenantId, stripeAccountId: account.id },
        data: {
          chargesEnabled: account.charges_enabled,
          payoutsEnabled: account.payouts_enabled,
          detailsSubmitted: account.details_submitted,
          requirements,
        },
      }),
    );
    this.logger.log(`connect account ${account.id} synced (charges=${account.charges_enabled})`);
  }
}
