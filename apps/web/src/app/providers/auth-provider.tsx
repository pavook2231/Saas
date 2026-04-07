'use client';

import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { authApi } from '../lib/auth/api';
import { authStorage } from '../lib/auth/storage';
import {
  AuthResponse,
  AuthStatus,
  AuthUser,
  LoginPayload,
  OAuthProviderName,
  RegisterPayload,
  StoredSession,
} from '../lib/auth/types';

type AuthContextValue = {
  status: AuthStatus;
  user: AuthUser | null;
  accessToken: string | null;
  csrfToken: string | null;
  login: (payload: LoginPayload) => Promise<StoredSession>;
  register: (payload: RegisterPayload) => Promise<StoredSession>;
  logout: () => Promise<void>;
  startOAuth: (provider: OAuthProviderName, returnTo?: string) => Promise<void>;
  completeOAuthLogin: (csrfTokenOverride?: string) => Promise<StoredSession>;
  refreshSession: () => Promise<StoredSession>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const toStoredSession = (payload: AuthResponse): StoredSession => {
  if (!payload.csrfToken) {
    throw new Error('Сервер не вернул CSRF токен для сессии');
  }

  return {
    user: payload.user,
    accessToken: payload.tokens.accessToken,
    accessTokenExpiresAt: payload.tokens.accessTokenExpiresAt,
    csrfToken: payload.csrfToken,
  };
};

export function AuthProvider({ children }: PropsWithChildren) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [session, setSession] = useState<StoredSession | null>(null);

  const applySession = useCallback((nextSession: StoredSession) => {
    authStorage.save(nextSession);
    setSession(nextSession);
    setStatus('authenticated');
    return nextSession;
  }, []);

  const clearSession = useCallback(() => {
    authStorage.clear();
    setSession(null);
    setStatus('unauthenticated');
  }, []);

  const login = useCallback(
    async (payload: LoginPayload) => {
      const response = await authApi.login(payload);
      return applySession(toStoredSession(response));
    },
    [applySession],
  );

  const register = useCallback(
    async (payload: RegisterPayload) => {
      const response = await authApi.register(payload);
      return applySession(toStoredSession(response));
    },
    [applySession],
  );

  const refreshFromToken = useCallback(
    async (csrfToken: string) => {
      const response = await authApi.refresh(csrfToken);
      return applySession(toStoredSession(response));
    },
    [applySession],
  );

  const refreshSession = useCallback(async () => {
    const stored = authStorage.load();

    if (!stored?.csrfToken) {
      throw new Error('Сессия для обновления не найдена');
    }

    return refreshFromToken(stored.csrfToken);
  }, [refreshFromToken]);

  const completeOAuthLogin = useCallback(
    async (csrfTokenOverride?: string) => {
      const fallback = authStorage.load()?.csrfToken;
      const csrfToken = csrfTokenOverride ?? fallback;

      if (!csrfToken) {
        throw new Error('Не удалось завершить OAuth вход');
      }

      return refreshFromToken(csrfToken);
    },
    [refreshFromToken],
  );

  const logout = useCallback(async () => {
    const stored = authStorage.load();

    try {
      if (stored?.csrfToken) {
        await authApi.logout(stored.csrfToken);
      }
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const startOAuth = useCallback(
    async (provider: OAuthProviderName, returnTo = '/auth/callback') => {
      const response = await authApi.startOAuth(provider, returnTo, session?.accessToken ?? undefined);
      window.location.assign(response.authorizationUrl);
    },
    [session?.accessToken],
  );

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      const stored = authStorage.load();

      if (!stored) {
        if (!cancelled) {
          setStatus('unauthenticated');
        }
        return;
      }

      try {
        const me = await authApi.me(stored.accessToken);

        if (!cancelled) {
          applySession({
            ...stored,
            user: me.user,
          });
        }
        return;
      } catch {
        try {
          const refreshed = await refreshFromToken(stored.csrfToken);

          if (!cancelled) {
            applySession(refreshed);
          }
          return;
        } catch {
          if (!cancelled) {
            clearSession();
          }
        }
      }
    };

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [applySession, clearSession, refreshFromToken]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user: session?.user ?? null,
      accessToken: session?.accessToken ?? null,
      csrfToken: session?.csrfToken ?? null,
      login,
      register,
      logout,
      startOAuth,
      completeOAuthLogin,
      refreshSession,
    }),
    [
      completeOAuthLogin,
      login,
      logout,
      refreshSession,
      register,
      session?.accessToken,
      session?.csrfToken,
      session?.user,
      startOAuth,
      status,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth должен использоваться внутри AuthProvider');
  }

  return context;
};
