// Browser API client for the admin console. Talks to the NestJS API under
// /api/v1 using the httpOnly cookie session (P2.2) — no tokens in JS/localStorage.
//
// Cookies (access/refresh) are sent automatically via `credentials: 'include'`;
// the non-httpOnly CSRF cookie is echoed in the `X-CSRF-Token` header
// (double-submit). On a 401 we attempt one silent refresh, then retry once.

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
export const API_BASE = `${API_URL}/api/v1`;

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = document.cookie.match(new RegExp('(?:^|; )' + escaped + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]!) : null;
}

function messageFrom(data: unknown, status: number): string {
  if (data && typeof data === 'object' && 'message' in data) {
    const m = (data as { message: unknown }).message;
    if (typeof m === 'string') return m;
    if (Array.isArray(m)) return m.join(', ');
  }
  return `Request failed (${status})`;
}

function rawFetch(method: string, path: string, body?: unknown): Promise<Response> {
  const csrf = readCookie('aicos_csrf');
  return fetch(`${API_BASE}${path}`, {
    method,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// Don't trigger a silent refresh for the auth endpoints themselves (avoids loops).
const NO_REFRESH = new Set(['/auth/login', '/auth/signup', '/auth/refresh', '/auth/logout']);

// Single-flight refresh so concurrent 401s share one /auth/refresh call.
let refreshPromise: Promise<boolean> | null = null;
function silentRefresh(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = rawFetch('POST', '/auth/refresh')
      .then((r) => r.ok)
      .catch(() => false)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

export async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const basePath = path.split('?')[0]!;
  let res = await rawFetch(method, path, body);

  if (res.status === 401 && !NO_REFRESH.has(basePath)) {
    if (await silentRefresh()) {
      res = await rawFetch(method, path, body);
    }
  }

  if (res.status === 204) return undefined as T;
  const data: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    if (
      res.status === 401 &&
      typeof window !== 'undefined' &&
      !window.location.pathname.startsWith('/login')
    ) {
      window.location.href = '/login';
    }
    throw new ApiError(res.status, messageFrom(data, res.status), data);
  }
  return data as T;
}

export const apiGet = <T>(path: string) => api<T>('GET', path);
export const apiPost = <T>(path: string, body?: unknown) => api<T>('POST', path, body);
export const apiPatch = <T>(path: string, body?: unknown) => api<T>('PATCH', path, body);
export const apiDelete = <T>(path: string) => api<T>('DELETE', path);

/** Standard paginated list shape returned by the API. */
export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}
