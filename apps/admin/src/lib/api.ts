// Browser API client for the admin console. Talks to the NestJS API under
// /api/v1, attaches the bearer token, and normalises the error envelope the
// API's HttpExceptionFilter returns ({ statusCode, error, message, ... }).
//
// NOTE (security follow-up): the access token is kept in localStorage for the
// Phase 1 dev console. The risk register flags JWT-in-localStorage; before
// production this moves to an httpOnly-cookie session with silent refresh.

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
export const API_BASE = `${API_URL}/api/v1`;
const TOKEN_KEY = 'aicos.admin.token';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string | null): void {
  if (typeof window === 'undefined') return;
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
}

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

function messageFrom(data: unknown, status: number): string {
  if (data && typeof data === 'object' && 'message' in data) {
    const m = (data as { message: unknown }).message;
    if (typeof m === 'string') return m;
    if (Array.isArray(m)) return m.join(', ');
  }
  return `Request failed (${status})`;
}

export async function api<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return undefined as T;
  const data: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    if (res.status === 401 && typeof window !== 'undefined') {
      setToken(null);
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
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
