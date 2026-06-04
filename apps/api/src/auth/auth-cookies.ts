import { randomUUID } from 'node:crypto';
import type { Response } from 'express';
import type { TokenPair } from './auth.service';

/**
 * httpOnly cookie session for browser clients (P2.2 hardening). The access +
 * refresh JWTs live in httpOnly cookies so JavaScript/XSS can never read them;
 * a separate NON-httpOnly CSRF cookie is echoed back in an `X-CSRF-Token` header
 * (double-submit) to defend the cookie-authenticated mutations. Programmatic
 * clients keep using the `Authorization: Bearer` header (no cookies → no CSRF).
 */
export const ACCESS_COOKIE = 'aicos_access';
export const REFRESH_COOKIE = 'aicos_refresh';
export const CSRF_COOKIE = 'aicos_csrf';

/** Refresh cookie is scoped to the auth routes only (least exposure). */
const REFRESH_PATH = '/api/v1/auth';

export interface CookieConfig {
  /** Secure flag — true in production (HTTPS), false for local http dev. */
  secure: boolean;
  accessTtl: string;
  refreshTtl: string;
}

/** Set the access + refresh + csrf cookies; returns the issued CSRF token. */
export function setAuthCookies(res: Response, tokens: TokenPair, cfg: CookieConfig): string {
  const csrf = randomUUID();
  const accessMaxAge = ttlToMs(cfg.accessTtl, 15 * 60_000);
  const refreshMaxAge = ttlToMs(cfg.refreshTtl, 30 * 86_400_000);

  res.cookie(ACCESS_COOKIE, tokens.accessToken, {
    httpOnly: true,
    secure: cfg.secure,
    sameSite: 'lax',
    path: '/',
    maxAge: accessMaxAge,
  });
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    httpOnly: true,
    secure: cfg.secure,
    sameSite: 'strict',
    path: REFRESH_PATH,
    maxAge: refreshMaxAge,
  });
  res.cookie(CSRF_COOKIE, csrf, {
    httpOnly: false, // the SPA must read this to echo it in the X-CSRF-Token header
    secure: cfg.secure,
    sameSite: 'lax',
    path: '/',
    maxAge: refreshMaxAge,
  });
  return csrf;
}

/** Clear all auth cookies (logout). Attributes must match how they were set. */
export function clearAuthCookies(res: Response, secure: boolean): void {
  res.clearCookie(ACCESS_COOKIE, { httpOnly: true, secure, sameSite: 'lax', path: '/' });
  res.clearCookie(REFRESH_COOKIE, { httpOnly: true, secure, sameSite: 'strict', path: REFRESH_PATH });
  res.clearCookie(CSRF_COOKIE, { httpOnly: false, secure, sameSite: 'lax', path: '/' });
}

/** TTL string (`15m`, `30d`, `12h`, `45s`, or raw seconds) → milliseconds. */
function ttlToMs(ttl: string, fallback: number): number {
  const match = /^(\d+)([smhd])?$/.exec(ttl.trim());
  if (!match) return fallback;
  const value = Number(match[1]);
  const unit = match[2] ?? 's';
  const factor = unit === 'd' ? 86_400_000 : unit === 'h' ? 3_600_000 : unit === 'm' ? 60_000 : 1_000;
  return value * factor;
}
