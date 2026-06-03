'use client';

import * as React from 'react';
import { Button, Card } from '@aicos/ui';
import type { ApiResponse, TokenPair } from '@aicos/types';

/**
 * API base URL. The api service is locked to port 4000 (see .env.example);
 * `NEXT_PUBLIC_API_URL` lets deployments override it without a code change.
 */
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const LOGIN_ENDPOINT = `${API_URL}/api/v1/auth/login`;

type Status =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'error'; message: string }
  | { kind: 'success' };

export default function LoginPage() {
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [status, setStatus] = React.useState<Status>({ kind: 'idle' });

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus({ kind: 'submitting' });

    try {
      const res = await fetch(LOGIN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });

      // Phase 0: we don't persist a session yet. We just validate the round-trip
      // and surface the API's success/error envelope. A real session (cookie /
      // token store + redirect) is wired in a later phase.
      const body = (await res.json().catch(() => null)) as ApiResponse<TokenPair> | null;

      if (!res.ok || !body || body.success === false) {
        const message =
          body && body.success === false
            ? body.error.message
            : `Sign-in failed (${res.status}).`;
        setStatus({ kind: 'error', message });
        return;
      }

      setStatus({ kind: 'success' });
    } catch {
      setStatus({
        kind: 'error',
        message: `Could not reach the API at ${API_URL}. Is it running on port 4000?`,
      });
    }
  }

  const submitting = status.kind === 'submitting';

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-lg font-bold text-white">
            A
          </span>
          <h1 className="text-xl font-semibold text-neutral-900">Sign in to AICOS</h1>
          <p className="mt-1 text-sm text-neutral-500">Admin console</p>
        </div>

        <Card variant="elevated" padding="lg">
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-sm font-medium text-neutral-700">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@aicos.local"
                className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900 placeholder:text-neutral-400 focus-visible:border-brand-500"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="text-sm font-medium text-neutral-700">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900 placeholder:text-neutral-400 focus-visible:border-brand-500"
              />
            </div>

            {status.kind === 'error' ? (
              <p
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
              >
                {status.message}
              </p>
            ) : null}

            {status.kind === 'success' ? (
              <p
                role="status"
                className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700"
              >
                Signed in. Session wiring lands in a later phase.
              </p>
            ) : null}

            <Button type="submit" fullWidth isLoading={submitting}>
              {submitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </Card>

        <p className="mt-6 text-center text-xs text-neutral-400">
          Phase 0 stub — posts to <code className="text-neutral-500">/api/v1/auth/login</code>.
          No session is persisted yet.
        </p>
      </div>
    </main>
  );
}
