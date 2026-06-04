import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Stripe from 'stripe';
import {
  FinancialStatus,
  FulfillmentStatus,
  OrderStatus,
  ProductStatus,
  StoreStatus,
  type Prisma,
} from '@aicos/db';
import { PrismaService } from '../prisma/prisma.service';
import { StripeService } from '../billing/stripe.service';
import { platformFeeCents } from './fee.util';
import type { CreateCheckoutDto } from './dto/create-checkout.dto';

interface CheckoutResult {
  orderId: string;
  orderNumber: string;
  sessionId: string;
  url: string | null;
}

/** Cart item joined with its variant + product (for re-pricing at checkout). */
type CartItemForCheckout = Prisma.CartItemGetPayload<{
  include: {
    variant: { include: { product: { select: { status: true; title: true; slug: true } } } };
  };
}>;

/**
 * Checkout orchestration: convert a storefront cart into a DRAFT Order and open
 * a Stripe Checkout Session for payment. The order is created PENDING-of-payment
 * (status DRAFT / financialStatus UNPAID); the worker flips it to PAID when
 * Stripe delivers `checkout.session.completed`.
 *
 * Connect: when the tenant has an onboarded ConnectAccount (chargesEnabled), the
 * session uses a destination charge — funds settle on the connected account and
 * the platform takes `application_fee_amount` (PLATFORM_FEE_BPS of subtotal).
 * Without Connect (dev), it falls back to a direct charge on the platform
 * account (logged) so the flow is still exercisable end-to-end.
 */
@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeService,
    private readonly config: ConfigService,
  ) {}

  async checkout(slug: string, dto: CreateCheckoutDto): Promise<CheckoutResult> {
    // Fail fast (503) when outbound Stripe is unconfigured — no orphan order.
    this.stripe.assertApiConfigured();

    const store = await this.prisma.asSystem((tx) =>
      tx.store.findFirst({
        where: { slug, status: StoreStatus.PUBLISHED },
        select: { id: true, tenantId: true, currency: true, name: true },
      }),
    );
    if (!store) throw new NotFoundException('Store not found');
    const tenantId = store.tenantId;

    // Load + re-price the cart authoritatively from live variant prices.
    const cart = await this.prisma.forTenant(tenantId, (tx) =>
      tx.cart.findFirst({
        where: { token: dto.token },
        include: {
          items: {
            orderBy: { createdAt: 'asc' },
            include: {
              variant: {
                include: { product: { select: { status: true, title: true, slug: true } } },
              },
            },
          },
        },
      }),
    );
    if (!cart) throw new NotFoundException('Cart not found');
    if (cart.convertedOrderId) throw new BadRequestException('Cart already checked out');
    if (cart.items.length === 0) throw new BadRequestException('Cart is empty');

    const lines = cart.items.map((it) => this.toLine(it));
    const subtotalCents = lines.reduce((s, l) => s + l.totalCents, 0);

    // Platform fee (destination charge only). bps → cents of subtotal.
    const feeBps = this.config.get<number>('commerce.platformFeeBps') ?? 0;
    const connect = await this.prisma.forTenant(tenantId, (tx) =>
      tx.connectAccount.findUnique({ where: { tenantId } }),
    );
    const useConnect = Boolean(connect?.chargesEnabled && connect.stripeAccountId);
    const applicationFeeCents = useConnect ? platformFeeCents(subtotalCents, feeBps) : 0;

    // Create the DRAFT order (+ line snapshots) before opening the session, so
    // the session metadata can carry the order id for webhook reconciliation.
    const order = await this.prisma.forTenant(tenantId, async (tx) => {
      const last = await tx.order.findFirst({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        select: { number: true },
      });
      const nextNumber = last ? (parseInt(last.number, 10) || 1000) + 1 : 1001;

      return tx.order.create({
        data: {
          tenantId,
          storeId: store.id,
          number: String(nextNumber),
          status: OrderStatus.DRAFT,
          financialStatus: FinancialStatus.UNPAID,
          fulfillmentStatus: FulfillmentStatus.UNFULFILLED,
          currency: store.currency,
          subtotalCents,
          totalCents: subtotalCents,
          applicationFeeCents,
          email: dto.email ?? null,
          items: {
            create: lines.map((l) => ({
              tenantId,
              variantId: l.variantId,
              productTitle: l.productTitle,
              variantTitle: l.variantTitle,
              sku: l.sku,
              quantity: l.quantity,
              unitPriceCents: l.unitPriceCents,
              totalCents: l.totalCents,
            })),
          },
        },
        select: { id: true, number: true },
      });
    });

    // Open the Stripe Checkout Session. On any failure, roll back the order so a
    // retry starts clean (no orphan DRAFT accumulating).
    try {
      const session = await this.createSession({
        store,
        order,
        lines,
        email: dto.email,
        cartToken: dto.token,
        useConnect,
        applicationFeeCents,
        destination: connect?.stripeAccountId,
      });

      const paymentIntentId =
        typeof session.payment_intent === 'string' ? session.payment_intent : null;

      await this.prisma.forTenant(tenantId, (tx) =>
        tx.order.update({
          where: { id: order.id },
          data: {
            stripeCheckoutSessionId: session.id,
            stripePaymentIntentId: paymentIntentId,
            status: OrderStatus.PENDING,
          },
        }),
      );

      this.logger.log(
        `checkout: order ${order.number} (${order.id}) → session ${session.id} ` +
          `[${useConnect ? `connect fee=${applicationFeeCents}c` : 'direct (no connect)'}]`,
      );
      return { orderId: order.id, orderNumber: order.number, sessionId: session.id, url: session.url };
    } catch (err) {
      await this.prisma
        .forTenant(tenantId, (tx) => tx.order.delete({ where: { id: order.id } }))
        .catch(() => undefined);
      const message = err instanceof Error ? err.message : 'Stripe Checkout failed';
      this.logger.error(`checkout failed for store ${slug}: ${message}`);
      throw new BadRequestException(`Checkout failed: ${message}`);
    }
  }

  private toLine(it: CartItemForCheckout) {
    if (!it.variant || it.variant.product.status !== ProductStatus.ACTIVE) {
      throw new BadRequestException(
        `"${it.variant?.product.title ?? 'An item'}" is no longer available`,
      );
    }
    const unitPriceCents = it.variant.priceCents; // authoritative live price
    return {
      variantId: it.variantId,
      productTitle: it.variant.product.title,
      variantTitle: it.variant.title,
      sku: it.variant.sku,
      quantity: it.quantity,
      unitPriceCents,
      totalCents: unitPriceCents * it.quantity,
    };
  }

  private async createSession(args: {
    store: { id: string; tenantId: string; currency: string; name: string };
    order: { id: string; number: string };
    lines: ReturnType<CheckoutService['toLine']>[];
    email?: string;
    cartToken: string;
    useConnect: boolean;
    applicationFeeCents: number;
    destination?: string;
  }): Promise<Stripe.Checkout.Session> {
    const { store, order, lines, email, cartToken, useConnect, applicationFeeCents, destination } =
      args;
    const successUrl = this.config.get<string>('commerce.checkoutSuccessUrl')!;
    const cancelUrl = this.config.get<string>('commerce.checkoutCancelUrl')!;
    const taxEnabled = this.config.get<boolean>('commerce.taxEnabled') ?? false;

    const metadata: Stripe.MetadataParam = {
      tenantId: store.tenantId,
      orderId: order.id,
      orderNumber: order.number,
      cartToken,
    };

    const params: Stripe.Checkout.SessionCreateParams = {
      mode: 'payment',
      line_items: lines.map((l) => ({
        quantity: l.quantity,
        price_data: {
          currency: store.currency.toLowerCase(),
          unit_amount: l.unitPriceCents,
          product_data: {
            name: l.variantTitle ? `${l.productTitle} — ${l.variantTitle}` : l.productTitle,
            ...(l.sku ? { metadata: { sku: l.sku } } : {}),
          },
        },
      })),
      success_url: `${successUrl}?order=${order.id}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${cancelUrl}?order=${order.id}`,
      metadata,
      payment_intent_data: {
        metadata,
        ...(useConnect && destination
          ? {
              application_fee_amount: applicationFeeCents,
              transfer_data: { destination },
            }
          : {}),
      },
      ...(email ? { customer_email: email } : {}),
      ...(taxEnabled ? { automatic_tax: { enabled: true } } : {}),
    };

    return this.stripe.client.checkout.sessions.create(params);
  }
}
