'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { apiGet, apiPost, getToken, setToken } from './api';

export interface AuthUser {
  userId: string;
  tenantId: string;
  email: string;
  roleId: string;
  roleType: string;
  permissions: string[];
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: string;
}

interface AuthState {
  user: AuthUser | null;
  /** True once the initial token→user resolution has finished. */
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = React.createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = React.useState<AuthUser | null>(null);
  const [ready, setReady] = React.useState(false);

  // On first mount, resolve the persisted token into the current principal.
  React.useEffect(() => {
    if (!getToken()) {
      setReady(true);
      return;
    }
    apiGet<AuthUser>('/auth/me')
      .then(setUser)
      .catch(() => setToken(null))
      .finally(() => setReady(true));
  }, []);

  const login = React.useCallback(async (email: string, password: string) => {
    const tokens = await apiPost<TokenPair>('/auth/login', { email, password });
    setToken(tokens.accessToken);
    setUser(await apiGet<AuthUser>('/auth/me'));
  }, []);

  const logout = React.useCallback(() => {
    setToken(null);
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
