import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import type { AuthenticatedUser } from '../types/authenticated-user';

function makeContext(user?: Partial<AuthenticatedUser>): ExecutionContext {
  const request = { user };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  function guardWith(required: string[] | undefined): RolesGuard {
    const reflector = {
      getAllAndOverride: () => required,
    } as unknown as Reflector;
    return new RolesGuard(reflector);
  }

  it('allows when no permissions are required', () => {
    const guard = guardWith(undefined);
    expect(guard.canActivate(makeContext({ permissions: [] }))).toBe(true);
  });

  it('allows when the user holds the exact grant', () => {
    const guard = guardWith(['user:read']);
    expect(
      guard.canActivate(makeContext({ permissions: ['user:read'] })),
    ).toBe(true);
  });

  it('allows via resource wildcard', () => {
    const guard = guardWith(['user:read']);
    expect(
      guard.canActivate(makeContext({ permissions: ['user:*'] })),
    ).toBe(true);
  });

  it('allows via global wildcard (owner)', () => {
    const guard = guardWith(['billing:read']);
    expect(guard.canActivate(makeContext({ permissions: ['*'] }))).toBe(true);
  });

  it('denies when the grant is missing', () => {
    const guard = guardWith(['billing:write']);
    expect(() =>
      guard.canActivate(makeContext({ permissions: ['user:read'] })),
    ).toThrow(ForbiddenException);
  });

  it('denies when there is no authenticated principal', () => {
    const guard = guardWith(['user:read']);
    expect(() => guard.canActivate(makeContext(undefined))).toThrow(
      ForbiddenException,
    );
  });
});
