import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { ACCESS_COOKIE, CSRF_COOKIE, REFRESH_COOKIE } from '../../auth/auth-cookies';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF protection for cookie-authenticated sessions (double-submit token).
 *
 * Only enforced when the request is BOTH a state-changing method AND carries an
 * auth cookie — i.e. a browser cookie session, the only thing CSRF can abuse.
 * Bearer-token API clients (curl, the worker, tests, the storefront's public
 * cookieless calls) carry no auth cookie and are skipped. The client must echo
 * the non-httpOnly CSRF cookie in the `X-CSRF-Token` header; an attacker's
 * cross-site form can send the cookie but cannot read it to set the header.
 *
 * Registered as a global guard ahead of auth; runs after cookie-parser.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context
      .switchToHttp()
      .getRequest<Request & { cookies?: Record<string, string> }>();

    if (SAFE_METHODS.has(req.method)) return true;

    const cookies = req.cookies ?? {};
    const cookieAuthed = Boolean(cookies[ACCESS_COOKIE] || cookies[REFRESH_COOKIE]);
    if (!cookieAuthed) return true; // not a cookie session → no CSRF surface

    const cookieToken = cookies[CSRF_COOKIE];
    const headerRaw = req.headers['x-csrf-token'];
    const headerToken = Array.isArray(headerRaw) ? headerRaw[0] : headerRaw;

    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
      throw new ForbiddenException('CSRF token missing or invalid');
    }
    return true;
  }
}
