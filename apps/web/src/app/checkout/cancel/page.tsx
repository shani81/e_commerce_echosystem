'use client';

import Link from 'next/link';
import { Button } from '@aicos/ui';

export default function CheckoutCancelPage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-neutral-50 px-6">
      <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-600">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-7 w-7">
            <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-neutral-900">Checkout canceled</h1>
        <p className="mt-2 text-sm text-neutral-600">
          No payment was taken. Your cart is still saved — pick up where you left off.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Link href="/cart">
            <Button fullWidth>Back to cart</Button>
          </Link>
          <Link href="/shop">
            <Button fullWidth variant="ghost">
              Continue shopping
            </Button>
          </Link>
        </div>
      </div>
    </main>
  );
}
