import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { CsrfGuard } from './csrf.guard';
import { ACCESS_COOKIE, CSRF_COOKIE } from '../../auth/auth-cookies';

function ctx(
  method: string,
  cookies: Record<string, string>,
  headers: Record<string, string> = {},
): ExecutionContext {
  const req = { method, cookies, headers };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe('CsrfGuard', () => {
  const guard = new CsrfGuard();

  it('allows safe methods (GET)', () => {
    expect(guard.canActivate(ctx('GET', {}))).toBe(true);
  });

  it('allows mutations with no auth cookie (Bearer / public)', () => {
    expect(guard.canActivate(ctx('POST', {}))).toBe(true);
  });

  it('allows a cookie-session mutation with a matching CSRF token', () => {
    const c = ctx('POST', { [ACCESS_COOKIE]: 'a', [CSRF_COOKIE]: 'tok' }, { 'x-csrf-token': 'tok' });
    expect(guard.canActivate(c)).toBe(true);
  });

  it('blocks a cookie-session mutation with a missing header', () => {
    const c = ctx('POST', { [ACCESS_COOKIE]: 'a', [CSRF_COOKIE]: 'tok' });
    expect(() => guard.canActivate(c)).toThrow(ForbiddenException);
  });

  it('blocks a cookie-session mutation with a mismatched token', () => {
    const c = ctx('POST', { [ACCESS_COOKIE]: 'a', [CSRF_COOKIE]: 'tok' }, { 'x-csrf-token': 'WRONG' });
    expect(() => guard.canActivate(c)).toThrow(ForbiddenException);
  });
});
