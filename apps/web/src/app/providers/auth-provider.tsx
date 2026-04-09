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
  ChangePasswordPayload,
  LoginPayload,
  OAuthProviderName,
  RegisterPayload,
  StoredSession,
  UpdateProfilePayload,
} from '../lib/auth/types';

type AuthContextValue = {
  status: AuthStatus;
  user: AuthUser | null;
  accessToken: string | null;
  csrfToken: string | null;
  login: (payload: LoginPayload) => Promise<StoredSession>;
  register: (payload: RegisterPayload) => Promise<StoredSession>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  updateProfile: (payload: UpdateProfilePayload) => Promise<StoredSession>;
  changePassword: (payload: ChangePasswordPayload) => Promise<void>;
  startOAuth: (provider: OAuthProviderName, returnTo?: string) => Promise<void>;
  completeOAuthLogin: (csrfTokenOverride?: string) => Promise<StoredSession>;
  refreshSession: () => Promise<StoredSession>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const toStoredSession = (payload: AuthResponse): StoredSession => {
  if (!payload.csrfToken) {
    throw new Error('Сервер не вернул CSRF-токен для сессии');
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
    const csrfToken = session?.csrfToken ?? authStorage.getCsrfToken();

    if (!csrfToken) {
      throw new Error('Сессия для обновления не найдена');
    }

    return refreshFromToken(csrfToken);
  }, [refreshFromToken, session?.csrfToken]);

  const completeOAuthLogin = useCallback(
    async (csrfTokenOverride?: string) => {
      const csrfToken = csrfTokenOverride ?? authStorage.getCsrfToken();

      if (!csrfToken) {
        throw new Error('Не удалось завершить OAuth-вход');
      }

      return refreshFromToken(csrfToken);
    },
    [refreshFromToken],
  );

  const logout = useCallback(async () => {
    const csrfToken = session?.csrfToken ?? authStorage.getCsrfToken();

    try {
      if (csrfToken) {
        await authApi.logout(csrfToken);
      }
    } finally {
      clearSession();
    }
  }, [clearSession, session?.csrfToken]);

  const logoutAll = useCallback(async () => {
    try {
      if (session?.accessToken) {
        await authApi.logoutAll(session.accessToken);
      }
    } finally {
      clearSession();
    }
  }, [clearSession, session?.accessToken]);

  const updateProfile = useCallback(
    async (payload: UpdateProfilePayload) => {
      const accessToken = session?.accessToken;
      const csrfToken = session?.csrfToken ?? authStorage.getCsrfToken();

      if (!accessToken || !csrfToken || !session) {
        throw new Error('Сессия не найдена');
      }

      const response = await authApi.updateProfile(accessToken, payload);

      return applySession({
        ...session,
        csrfToken,
        user: response.user,
      });
    },
    [applySession, session],
  );

  const changePassword = useCallback(
    async (payload: ChangePasswordPayload) => {
      const accessToken = session?.accessToken;

      if (!accessToken) {
        throw new Error('Сессия не найдена');
      }

      await authApi.changePassword(accessToken, payload);
    },
    [session?.accessToken],
  );

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
      authStorage.load();
      const csrfToken = authStorage.getCsrfToken();

      if (!csrfToken) {
        if (!cancelled) {
          setStatus('unauthenticated');
        }
        return;
      }

      try {
        const refreshed = await refreshFromToken(csrfToken);

        if (!cancelled) {
          applySession(refreshed);
        }
      } catch {
        if (!cancelled) {
          clearSession();
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
      logoutAll,
      updateProfile,
      changePassword,
      startOAuth,
      completeOAuthLogin,
      refreshSession,
    }),
    [
      completeOAuthLogin,
      changePassword,
      login,
      logout,
      logoutAll,
      refreshSession,
      register,
      session?.accessToken,
      session?.csrfToken,
      session?.user,
      startOAuth,
      status,
      updateProfile,
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
