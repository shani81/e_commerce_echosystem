'use client';

import * as React from 'react';
import { Button, Badge, Card } from '@aicos/ui';
import { PageHeader } from '@/components/ui/page-header';
import { apiGet, apiPost, ApiError } from '@/lib/api';

interface ConnectStatus {
  connected: boolean;
  stripeAccountId: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  requirementsDue: string[];
}

export default function ConnectSettingsPage() {
  const [status, setStatus] = React.useState<ConnectStatus | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setStatus(await apiGet<ConnectStatus>('/connect/status'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load Connect status.');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  async function createAccount() {
    setBusy(true);
    setError(null);
    try {
      setStatus(await apiPost<ConnectStatus>('/connect/account', {}));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the Connect account.');
    } finally {
      setBusy(false);
    }
  }

  async function startOnboarding() {
    setBusy(true);
    setError(null);
    try {
      const { url } = await apiPost<{ url: string }>('/connect/onboarding-link', {});
      window.location.href = url;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start onboarding.');
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Payments"
        description="Connect your Stripe account to accept payments and receive payouts."
      />

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </p>
      ) : null}

      <Card variant="outline" padding="lg">
        {loading ? (
          <p className="text-sm text-neutral-500">Loading…</p>
        ) : !status?.connected ? (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-neutral-900">No Stripe account connected</h3>
              <p className="mt-1 text-sm text-neutral-600">
                Create a connected Stripe account, then complete onboarding to enable checkout.
                Funds settle to your account; AICOS collects its platform fee per order.
              </p>
            </div>
            <Button isLoading={busy} onClick={createAccount}>
              Create Stripe account
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={status.chargesEnabled ? 'success' : 'warning'}>
                {status.chargesEnabled ? 'Charges enabled' : 'Charges pending'}
              </Badge>
              <Badge variant={status.payoutsEnabled ? 'success' : 'warning'}>
                {status.payoutsEnabled ? 'Payouts enabled' : 'Payouts pending'}
              </Badge>
              <Badge variant={status.detailsSubmitted ? 'success' : 'neutral'}>
                {status.detailsSubmitted ? 'Details submitted' : 'Details incomplete'}
              </Badge>
            </div>

            {status.stripeAccountId ? (
              <p className="text-xs text-neutral-500">
                Account <span className="font-mono">{status.stripeAccountId}</span>
              </p>
            ) : null}

            {status.requirementsDue.length > 0 ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <p className="font-medium">Stripe needs more information:</p>
                <ul className="mt-1 list-inside list-disc">
                  {status.requirementsDue.map((r) => (
                    <li key={r}>{r.replace(/[._]/g, ' ')}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="flex items-center gap-2">
              <Button variant={status.chargesEnabled ? 'outline' : 'primary'} isLoading={busy} onClick={startOnboarding}>
                {status.detailsSubmitted ? 'Update Stripe details' : 'Continue onboarding'}
              </Button>
              <Button variant="ghost" onClick={load}>
                Refresh
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
