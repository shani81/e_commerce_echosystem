'use client';

import type { ReactNode } from 'react';
import { AuthProvider } from '@/lib/auth';

/** Client-side providers wrapped around the whole app in the root layout. */
export function Providers({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
