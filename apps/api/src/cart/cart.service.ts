import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  InventoryPolicy,
  ProductStatus,
  StoreStatus,
  type Prisma,
} from '@aicos/db';
import { PrismaService } from '../prisma/prisma.service';
import type { AddCartItemDto } from './dto/add-cart-item.dto';

/** A resolved cart line with live snapshot data for display. */
export interface CartLine {
  variantId: string;
  productSlug: string;
  productTitle: string;
  variantTitle: string;
  sku: string | null;
  unitPriceCents: number;
  quantity: number;
  lineTotalCents: number;
}

/** Public cart view returned to the storefront. */
export interface CartView {
  token: string;
  currency: string;
  items: CartLine[];
  subtotalCents: number;
  itemCount: number;
}

/** A variant row joined with the parent product's sellability + title/slug. */
type VariantForCart = Prisma.ProductVariantGetPayload<{
  include: { product: { select: { status: true; title: true; slug: true } } };
}>;

/**
 * Storefront cart. Anonymous + token-addressed (the storefront keeps the token
 * in local storage). Store-slug resolves to a tenant (public, via asSystem);
 * writes are tenant-scoped via forTenant so RLS still guards the rows.
 *
 * Prices are captured at add-to-cart time (CartItem.unitPriceCents) so a later
 * catalog price change does not silently re-price an in-progress basket; the
 * authoritative re-price happens again at checkout.
 */
@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

  private async resolveStore(
    slug: string,
  ): Promise<{ id: string; tenantId: string; currency: string }> {
    const store = await this.prisma.asSystem((tx) =>
      tx.store.findFirst({
        where: { slug, status: StoreStatus.PUBLISHED },
        select: { id: true, tenantId: true, currency: true },
      }),
    );
    if (!store) throw new NotFoundException('Store not found');
    return store;
  }

  async createCart(slug: string): Promise<CartView> {
    const store = await this.resolveStore(slug);
    const token = randomUUID();
    await this.prisma.forTenant(store.tenantId, (tx) =>
      tx.cart.create({
        data: {
          tenantId: store.tenantId,
          storeId: store.id,
          token,
          currency: store.currency,
        },
      }),
    );
    return { token, currency: store.currency, items: [], subtotalCents: 0, itemCount: 0 };
  }

  async getCart(slug: string, token: string): Promise<CartView> {
    const store = await this.resolveStore(slug);
    return this.viewCart(store.tenantId, token);
  }

  async addItem(slug: string, token: string, dto: AddCartItemDto): Promise<CartView> {
    const store = await this.resolveStore(slug);
    const qty = dto.quantity ?? 1;

    await this.prisma.forTenant(store.tenantId, async (tx) => {
      const cart = await tx.cart.findFirst({
        where: { token },
        select: { id: true, convertedOrderId: true },
      });
      if (!cart) throw new NotFoundException('Cart not found');
      if (cart.convertedOrderId) throw new BadRequestException('Cart already checked out');

      const variant = await tx.productVariant.findFirst({
        where: { id: dto.variantId, deletedAt: null },
        include: { product: { select: { status: true, title: true, slug: true } } },
      });
      if (!variant || variant.product.status !== ProductStatus.ACTIVE) {
        throw new BadRequestException('Variant is not available for purchase');
      }

      const existing = await tx.cartItem.findFirst({
        where: { cartId: cart.id, variantId: dto.variantId },
      });
      const nextQty = (existing?.quantity ?? 0) + qty;
      await this.assertStock(tx, variant, nextQty);

      if (existing) {
        await tx.cartItem.update({
          where: { id: existing.id },
          data: { quantity: nextQty, unitPriceCents: variant.priceCents },
        });
      } else {
        await tx.cartItem.create({
          data: {
            tenantId: store.tenantId,
            cartId: cart.id,
            variantId: dto.variantId,
            quantity: qty,
            unitPriceCents: variant.priceCents,
          },
        });
      }
    });

    return this.viewCart(store.tenantId, token);
  }

  async setQuantity(
    slug: string,
    token: string,
    variantId: string,
    quantity: number,
  ): Promise<CartView> {
    const store = await this.resolveStore(slug);

    await this.prisma.forTenant(store.tenantId, async (tx) => {
      const cart = await tx.cart.findFirst({
        where: { token },
        select: { id: true, convertedOrderId: true },
      });
      if (!cart) throw new NotFoundException('Cart not found');
      if (cart.convertedOrderId) throw new BadRequestException('Cart already checked out');

      const item = await tx.cartItem.findFirst({
        where: { cartId: cart.id, variantId },
      });
      if (!item) throw new NotFoundException('Item not in cart');

      if (quantity === 0) {
        await tx.cartItem.delete({ where: { id: item.id } });
        return;
      }

      const variant = await tx.productVariant.findFirst({
        where: { id: variantId, deletedAt: null },
        include: { product: { select: { status: true, title: true, slug: true } } },
      });
      if (!variant || variant.product.status !== ProductStatus.ACTIVE) {
        throw new BadRequestException('Variant is not available for purchase');
      }
      await this.assertStock(tx, variant, quantity);
      await tx.cartItem.update({ where: { id: item.id }, data: { quantity } });
    });

    return this.viewCart(store.tenantId, token);
  }

  async removeItem(slug: string, token: string, variantId: string): Promise<CartView> {
    return this.setQuantity(slug, token, variantId, 0);
  }

  /**
   * Reject adding more than is in stock when the variant's policy is DENY.
   * Availability is summed across all of the variant's inventory items
   * (on-hand − reserved). CONTINUE-policy variants allow oversell/backorder.
   */
  private async assertStock(
    tx: Prisma.TransactionClient,
    variant: VariantForCart,
    wantedQty: number,
  ): Promise<void> {
    if (variant.inventoryPolicy !== InventoryPolicy.DENY) return;
    const agg = await tx.inventoryItem.aggregate({
      where: { variantId: variant.id },
      _sum: { onHand: true, reserved: true },
    });
    const available = (agg._sum.onHand ?? 0) - (agg._sum.reserved ?? 0);
    if (wantedQty > available) {
      throw new BadRequestException(
        `Insufficient stock: only ${Math.max(available, 0)} available`,
      );
    }
  }

  private async viewCart(tenantId: string, token: string): Promise<CartView> {
    const cart = await this.prisma.forTenant(tenantId, (tx) =>
      tx.cart.findFirst({
        where: { token },
        include: {
          items: {
            orderBy: { createdAt: 'asc' },
            include: {
              variant: {
                include: { product: { select: { title: true, slug: true } } },
              },
            },
          },
        },
      }),
    );
    if (!cart) throw new NotFoundException('Cart not found');

    const items: CartLine[] = cart.items.map((it) => ({
      variantId: it.variantId,
      productSlug: it.variant.product.slug,
      productTitle: it.variant.product.title,
      variantTitle: it.variant.title,
      sku: it.variant.sku,
      unitPriceCents: it.unitPriceCents,
      quantity: it.quantity,
      lineTotalCents: it.unitPriceCents * it.quantity,
    }));

    return {
      token: cart.token,
      currency: cart.currency,
      items,
      subtotalCents: items.reduce((s, i) => s + i.lineTotalCents, 0),
      itemCount: items.reduce((s, i) => s + i.quantity, 0),
    };
  }
}
