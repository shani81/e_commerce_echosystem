import { isPermissionGranted } from './match';

const set = (...p: string[]) => new Set(p);

describe('isPermissionGranted', () => {
  it('grants everything for the global wildcard "*"', () => {
    expect(isPermissionGranted('order:write', set('*'))).toBe(true);
  });

  it('grants everything for the seeded owner wildcard "*:*"', () => {
    expect(isPermissionGranted('catalog:read', set('*:*'))).toBe(true);
  });

  it('grants an exact match', () => {
    expect(isPermissionGranted('order:read', set('order:read'))).toBe(true);
  });

  it('grants via a resource wildcard', () => {
    expect(isPermissionGranted('order:write', set('order:*'))).toBe(true);
  });

  it('denies when the resource differs', () => {
    expect(isPermissionGranted('order:write', set('catalog:*', 'catalog:read'))).toBe(false);
  });

  it('denies an empty grant set', () => {
    expect(isPermissionGranted('order:write', set())).toBe(false);
  });

  it('does not treat a read grant as write', () => {
    expect(isPermissionGranted('order:write', set('order:read'))).toBe(false);
  });
});
