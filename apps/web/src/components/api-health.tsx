'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ApiResponse } from '@aicos/types';
import { Badge, Button, Card, CardDescription, CardHeader, CardTitle } from '@aicos/ui';

/**
 * The health endpoint of the AICOS API. Overridable at build time so previews
 * and staging can point elsewhere; defaults to the locked local API port (4000).
 */
const HEALTH_URL =
  process.env.NEXT_PUBLIC_API_HEALTH_URL ?? 'http://localhost:4000/api/v1/health';

/** Shape the API returns for a health probe (kept tolerant — see `parseStatus`). */
interface HealthPayload {
  status?: string;
  [key: string]: unknown;
}

type Phase = 'loading' | 'ok' | 'degraded' | 'unreachable';

interface HealthState {
  phase: Phase;
  /** Raw status string from the API, when available. */
  status?: string;
  /** Last successful check time, for display. */
  checkedAt?: Date;
}

/**
 * Normalize a fetched body into a status string. The API may return either a
 * bare `{ status: 'ok' }` or the standard `ApiResponse` envelope
 * (`{ success: true, data: { status } }`), so we accept both.
 */
function parseStatus(body: unknown): string | undefined {
  if (body && typeof body === 'object') {
    const enveloped = body as Partial<ApiResponse<HealthPayload>>;
    if (enveloped.success === true && enveloped.data && typeof enveloped.data === 'object') {
      const data = enveloped.data as HealthPayload;
      if (typeof data.status === 'string') return data.status;
    }
    const flat = body as HealthPayload;
    if (typeof flat.status === 'string') return flat.status;
  }
  return undefined;
}

function isHealthy(status: string | undefined): boolean {
  if (!status) return false;
  const s = status.toLowerCase();
  return s === 'ok' || s === 'up' || s === 'healthy' || s === 'pass';
}

export function ApiHealth() {
  const [state, setState] = useState<HealthState>({ phase: 'loading' });

  const check = useCallback(async () => {
    setState((prev) => ({ ...prev, phase: 'loading' }));

    // Abort slow probes so the card never hangs in "Checking…".
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    try {
      const res = await fetch(HEALTH_URL, {
        cache: 'no-store',
        signal: controller.signal,
        headers: { accept: 'application/json' },
      });

      let status: string | undefined;
      try {
        status = parseStatus(await res.json());
      } catch {
        // Non-JSON body — fall back to HTTP status semantics below.
      }

      const healthy = res.ok && (status === undefined || isHealthy(status));
      setState({
        phase: healthy ? 'ok' : 'degraded',
        status: status ?? (res.ok ? 'ok' : `HTTP ${res.status}`),
        checkedAt: new Date(),
      });
    } catch {
      // Network error, DNS failure, CORS block, or timeout — the API is simply
      // not reachable from the browser yet. This is expected in Phase 0.
      setState({ phase: 'unreachable', checkedAt: new Date() });
    } finally {
      clearTimeout(timeout);
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  return (
    <Card variant="outline" padding="lg" className="w-full">
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <CardTitle as="h2" className="text-sm font-semibold text-neutral-900">
            API health
          </CardTitle>
          <CardDescription className="font-mono text-xs text-neutral-500">
            GET {HEALTH_URL}
          </CardDescription>
        </div>
        <StatusBadge phase={state.phase} />
      </CardHeader>

      <div className="mt-4 flex items-center justify-between gap-4">
        <p className="text-sm text-neutral-600" aria-live="polite">
          {describe(state)}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void check()}
          isLoading={state.phase === 'loading'}
        >
          {state.phase === 'loading' ? 'Checking' : 'Re-check'}
        </Button>
      </div>
    </Card>
  );
}

function StatusBadge({ phase }: { phase: Phase }) {
  switch (phase) {
    case 'ok':
      return <Badge variant="success">Online</Badge>;
    case 'degraded':
      return <Badge variant="warning">Degraded</Badge>;
    case 'unreachable':
      return <Badge variant="neutral">Offline</Badge>;
    case 'loading':
    default:
      return <Badge variant="info">Checking…</Badge>;
  }
}

function describe(state: HealthState): string {
  const when = state.checkedAt
    ? ` (checked ${state.checkedAt.toLocaleTimeString()})`
    : '';
  switch (state.phase) {
    case 'ok':
      return `API reachable — status "${state.status ?? 'ok'}".${when}`;
    case 'degraded':
      return `API responded but reported "${state.status ?? 'unknown'}".${when}`;
    case 'unreachable':
      return `API not reachable yet. Start it on port 4000 with \`pnpm --filter @aicos/api dev\`.${when}`;
    case 'loading':
    default:
      return 'Contacting the AICOS API…';
  }
}
