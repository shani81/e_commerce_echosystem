/**
 * Platform application fee (Stripe Connect destination charge) in integer cents:
 * `bps` basis points of the order subtotal, rounded. Extracted from
 * CheckoutService so the money math is unit-tested in isolation. Non-positive
 * inputs yield 0 (no fee when there's no subtotal or no take rate).
 */
export function platformFeeCents(subtotalCents: number, bps: number): number {
  if (subtotalCents <= 0 || bps <= 0) return 0;
  return Math.round((subtotalCents * bps) / 10_000);
}
