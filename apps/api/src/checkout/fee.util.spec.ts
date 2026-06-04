import { platformFeeCents } from './fee.util';

describe('platformFeeCents', () => {
  it('computes 2.5% (250 bps) of $100.00', () => {
    expect(platformFeeCents(10_000, 250)).toBe(250);
  });

  it('rounds to the nearest cent', () => {
    // 199 * 250 / 10000 = 4.975 → 5
    expect(platformFeeCents(199, 250)).toBe(5);
  });

  it('is 0 when the take rate is 0 bps', () => {
    expect(platformFeeCents(10_000, 0)).toBe(0);
  });

  it('is 0 for an empty subtotal', () => {
    expect(platformFeeCents(0, 250)).toBe(0);
  });

  it('never returns a negative fee', () => {
    expect(platformFeeCents(-500, 250)).toBe(0);
  });

  it('supports a 100% fee edge (10000 bps)', () => {
    expect(platformFeeCents(4200, 10_000)).toBe(4200);
  });
});
