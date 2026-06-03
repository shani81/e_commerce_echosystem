'use client';

import * as React from 'react';
import Link from 'next/link';
import { Button } from '@aicos/ui';
import { setCartToken } from '@/lib/storefront-api';

export default function CheckoutSuccessPage() {
  const [orderId, setOrderId] = React.useState<string | null>(null);

  React.useEffect(() => {
    // Payment succeeded → the cart has been converted to an order server-side
    // (via the Stripe webhook). Clear the local cart token so a new visit starts
    // a fresh basket. Read the order id from the redirect query.
    setCartToken(null);
    const params = new URLSearchParams(window.location.search);
    setOrderId(params.get('order'));
  }, []);

  return (
    <main className="grid min-h-dvh place-items-center bg-neutral-50 px-6">
      <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-green-600">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-7 w-7">
            <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-neutral-900">Thank you!</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Your payment was successful and your order is confirmed. A receipt is on its way.
        </p>
        {orderId ? (
          <p className="mt-2 text-xs text-neutral-400">
            Order reference <span className="font-mono">{orderId}</span>
          </p>
        ) : null}
        <div className="mt-6">
          <Link href="/shop">
            <Button fullWidth>Continue shopping</Button>
          </Link>
        </div>
      </div>
    </main>
  );
}
