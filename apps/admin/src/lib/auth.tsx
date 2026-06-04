'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { apiGet, apiPost } from './api';

export interface AuthUser {
  userId: string;
  tenantId: string;
  email: string;
  roleId: string;
  roleType: string;
  permissions: string[];
}

interface AuthState {
  user: AuthUser | null;
  /** True once the initial session resolution has finished. */
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = React.createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = React.useState<AuthUser | null>(null);
  const [ready, setReady] = React.useState(false);

  // On first mount, resolve the cookie session into the current principal. The
  // api client silently refreshes once if the access cookie has expired.
  React.useEffect(() => {
    apiGet<AuthUser>('/auth/me')
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setReady(true));
  }, []);

  const login = React.useCallback(async (email: string, password: string) => {
    // Server sets the httpOnly session + CSRF cookies; nothing is stored in JS.
    await apiPost('/auth/login', { email, password });
    setUser(await apiGet<AuthUser>('/auth/me'));
  }, []);

  const logout = React.useCallback(() => {
    void apiPost('/auth/logout', {}).catch(() => undefined);
    setUser(null);
    router.replace('/login');
  }, [router]);

  const value = React.useMemo<AuthState>(
    () => ({ user, ready, login, logout }),
    [user, ready, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
