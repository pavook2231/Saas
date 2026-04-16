'use client';

import {
  createContext,
  type PropsWithChildren,
  useRef,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { sanitizeInternalPath } from '@/lib/safe-url';

import { AuthApiError, authApi } from '../lib/auth/api';
import { authStorage } from '../lib/auth/storage';
import {
  AuthResponse,
  AuthSuccessResponse,
  AuthStatus,
  AuthUser,
  ChangePasswordPayload,
  EmailCodeRequestPayload,
  EmailCodeRequestResponse,
  LoginPayload,
  LoginWithCodePayload,
  OAuthProviderName,
  RegisterPayload,
  RegisterWithCodePayload,
  ResetPasswordWithCodePayload,
  StoredSession,
  TotpSetupPayload,
  TotpSetupResponse,
  TotpTogglePayload,
  TwoFactorStatus,
  UpdateProfilePayload,
  VerifyLoginTwoFactorPayload,
} from '../lib/auth/types';

type AuthContextValue = {
  status: AuthStatus;
  user: AuthUser | null;
  accessToken: string | null;
  csrfToken: string | null;
  login: (payload: LoginPayload) => Promise<StoredSession | AuthResponse>;
  verifyLoginTwoFactor: (payload: VerifyLoginTwoFactorPayload) => Promise<StoredSession>;
  register: (payload: RegisterPayload) => Promise<StoredSession>;
  requestLoginCode: (payload: EmailCodeRequestPayload) => Promise<EmailCodeRequestResponse>;
  loginWithCode: (payload: LoginWithCodePayload) => Promise<StoredSession>;
  requestRegisterCode: (
    payload: EmailCodeRequestPayload,
  ) => Promise<EmailCodeRequestResponse>;
  registerWithCode: (payload: RegisterWithCodePayload) => Promise<StoredSession>;
  requestPasswordResetCode: (
    payload: EmailCodeRequestPayload,
  ) => Promise<EmailCodeRequestResponse>;
  resetPasswordWithCode: (
    payload: ResetPasswordWithCodePayload,
  ) => Promise<StoredSession>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  updateProfile: (payload: UpdateProfilePayload) => Promise<StoredSession>;
  changePassword: (payload: ChangePasswordPayload) => Promise<void>;
  getTwoFactorStatus: () => Promise<TwoFactorStatus>;
  beginTotpSetup: (payload: TotpSetupPayload) => Promise<TotpSetupResponse>;
  enableTotp: (payload: TotpTogglePayload) => Promise<TwoFactorStatus>;
  disableTotp: (payload: TotpTogglePayload) => Promise<TwoFactorStatus>;
  startOAuth: (provider: OAuthProviderName, returnTo?: string) => Promise<void>;
  completeOAuthLogin: (csrfTokenOverride?: string) => Promise<StoredSession>;
  refreshSession: () => Promise<StoredSession>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const isAuthenticatedResponse = (payload: AuthResponse): payload is AuthSuccessResponse =>
  payload.status === 'authenticated';

const toStoredSession = (payload: AuthSuccessResponse): StoredSession => {
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

const ACCESS_TOKEN_REFRESH_SKEW_MS = 60_000;
const RETRY_REFRESH_DELAY_MS = 30_000;

const parseExpiresAt = (value: string): number | null => {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const isAuthApiError = (error: unknown): error is AuthApiError => error instanceof AuthApiError;

export function AuthProvider({ children }: PropsWithChildren) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [session, setSession] = useState<StoredSession | null>(null);
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applySession = useCallback((nextSession: StoredSession) => {
    authStorage.save(nextSession);
    setSession(nextSession);
    setStatus('authenticated');
    return nextSession;
  }, []);

  const clearSession = useCallback(() => {
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
      refreshTimeoutRef.current = null;
    }

    authStorage.clear();
    setSession(null);
    setStatus('unauthenticated');
  }, []);

  const login = useCallback(
    async (payload: LoginPayload) => {
      const response = await authApi.login(payload);

      if (!isAuthenticatedResponse(response)) {
        return response;
      }

      return applySession(toStoredSession(response));
    },
    [applySession],
  );

  const verifyLoginTwoFactor = useCallback(
    async (payload: VerifyLoginTwoFactorPayload) => {
      const response = await authApi.verifyLoginTwoFactor(payload);

      if (!isAuthenticatedResponse(response)) {
        throw new Error('Сервер не завершил подтверждение входа.');
      }

      return applySession(toStoredSession(response));
    },
    [applySession],
  );

  const register = useCallback(
    async (payload: RegisterPayload) => {
      const response = await authApi.register(payload);

      if (!isAuthenticatedResponse(response)) {
        throw new Error('Сервер не завершил создание сессии.');
      }

      return applySession(toStoredSession(response));
    },
    [applySession],
  );

  const requestLoginCode = useCallback(
    async (payload: EmailCodeRequestPayload) => authApi.requestLoginCode(payload),
    [],
  );

  const loginWithCode = useCallback(
    async (payload: LoginWithCodePayload) => {
      const response = await authApi.loginWithCode(payload);

      if (!isAuthenticatedResponse(response)) {
        throw new Error('Сервер не завершил вход по коду.');
      }

      return applySession(toStoredSession(response));
    },
    [applySession],
  );

  const requestRegisterCode = useCallback(
    async (payload: EmailCodeRequestPayload) => authApi.requestRegisterCode(payload),
    [],
  );

  const registerWithCode = useCallback(
    async (payload: RegisterWithCodePayload) => {
      const response = await authApi.registerWithCode(payload);

      if (!isAuthenticatedResponse(response)) {
        throw new Error('Сервер не завершил регистрацию.');
      }

      return applySession(toStoredSession(response));
    },
    [applySession],
  );

  const requestPasswordResetCode = useCallback(
    async (payload: EmailCodeRequestPayload) => authApi.requestPasswordResetCode(payload),
    [],
  );

  const resetPasswordWithCode = useCallback(
    async (payload: ResetPasswordWithCodePayload) => {
      const response = await authApi.resetPasswordWithCode(payload);

      if (!isAuthenticatedResponse(response)) {
        throw new Error('Сервер не завершил восстановление пароля.');
      }

      return applySession(toStoredSession(response));
    },
    [applySession],
  );

  const refreshFromToken = useCallback(
    async (csrfToken: string) => {
      const response = await authApi.refresh(csrfToken);

      if (!isAuthenticatedResponse(response)) {
        throw new Error('Сервер не вернул обновленную сессию.');
      }

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

  const getTwoFactorStatus = useCallback(async () => {
    const accessToken = session?.accessToken;

    if (!accessToken) {
      throw new Error('Сессия не найдена');
    }

    return authApi.getTwoFactorStatus(accessToken);
  }, [session?.accessToken]);

  const beginTotpSetup = useCallback(
    async (payload: TotpSetupPayload) => {
      const accessToken = session?.accessToken;

      if (!accessToken) {
        throw new Error('Сессия не найдена');
      }

      return authApi.beginTotpSetup(accessToken, payload);
    },
    [session?.accessToken],
  );

  const enableTotp = useCallback(
    async (payload: TotpTogglePayload) => {
      const accessToken = session?.accessToken;

      if (!accessToken) {
        throw new Error('Сессия не найдена');
      }

      return authApi.enableTotp(accessToken, payload);
    },
    [session?.accessToken],
  );

  const disableTotp = useCallback(
    async (payload: TotpTogglePayload) => {
      const accessToken = session?.accessToken;

      if (!accessToken) {
        throw new Error('Сессия не найдена');
      }

      return authApi.disableTotp(accessToken, payload);
    },
    [session?.accessToken],
  );

  const startOAuth = useCallback(
    async (provider: OAuthProviderName, returnTo = '/auth/callback') => {
      const safeReturnTo = sanitizeInternalPath(returnTo, '/auth/callback') ?? '/auth/callback';
      const response = await authApi.startOAuth(provider, safeReturnTo);
      window.location.assign(response.authorizationUrl);
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      const storedSession = authStorage.load();
      const cookieCsrfToken = authStorage.getCsrfToken();
      const csrfToken = cookieCsrfToken ?? storedSession?.csrfToken ?? null;

      if (storedSession) {
        const storedExpiry = parseExpiresAt(storedSession.accessTokenExpiresAt);
        const hasFreshAccessToken =
          storedExpiry !== null && storedExpiry > Date.now() + 5_000;

        if (hasFreshAccessToken && !cancelled) {
          setSession(storedSession);
          setStatus('authenticated');
        }

        if (hasFreshAccessToken) {
          try {
            const response = await authApi.me(storedSession.accessToken);

            if (!cancelled) {
              applySession({
                ...storedSession,
                csrfToken: csrfToken ?? storedSession.csrfToken,
                user: response.user,
              });
            }

            return;
          } catch (error) {
            if (!isAuthApiError(error) || (error.status !== 401 && error.status !== 403)) {
              if (!cancelled) {
                setSession({
                  ...storedSession,
                  csrfToken: csrfToken ?? storedSession.csrfToken,
                });
                setStatus('authenticated');
              }

              return;
            }
          }
        }
      }

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
      } catch (error) {
        if (!cancelled && isAuthApiError(error) && (error.status === 401 || error.status === 403)) {
          clearSession();
        } else if (!cancelled && storedSession) {
          setSession({
            ...storedSession,
            csrfToken: csrfToken ?? storedSession.csrfToken,
          });
          setStatus('authenticated');
        } else if (!cancelled) {
          setStatus('unauthenticated');
        }
      }
    };

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [applySession, clearSession, refreshFromToken]);

  useEffect(() => {
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
      refreshTimeoutRef.current = null;
    }

    if (!session?.accessTokenExpiresAt || status !== 'authenticated') {
      return;
    }

    const expiresAt = parseExpiresAt(session.accessTokenExpiresAt);

    if (expiresAt === null) {
      return;
    }

    const scheduleRefresh = (delayMs: number) => {
      refreshTimeoutRef.current = setTimeout(async () => {
        try {
          await refreshSession();
        } catch (error) {
          if (isAuthApiError(error) && (error.status === 401 || error.status === 403)) {
            clearSession();
            return;
          }

          scheduleRefresh(RETRY_REFRESH_DELAY_MS);
        }
      }, delayMs);
    };

    const refreshInMs = Math.max(0, expiresAt - Date.now() - ACCESS_TOKEN_REFRESH_SKEW_MS);
    scheduleRefresh(refreshInMs);

    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = null;
      }
    };
  }, [clearSession, refreshSession, session?.accessTokenExpiresAt, status]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user: session?.user ?? null,
      accessToken: session?.accessToken ?? null,
      csrfToken: session?.csrfToken ?? null,
      login,
      verifyLoginTwoFactor,
      register,
      requestLoginCode,
      loginWithCode,
      requestRegisterCode,
      registerWithCode,
      requestPasswordResetCode,
      resetPasswordWithCode,
      logout,
      logoutAll,
      updateProfile,
      changePassword,
      getTwoFactorStatus,
      beginTotpSetup,
      enableTotp,
      disableTotp,
      startOAuth,
      completeOAuthLogin,
      refreshSession,
    }),
    [
      completeOAuthLogin,
      changePassword,
      getTwoFactorStatus,
      beginTotpSetup,
      enableTotp,
      disableTotp,
      loginWithCode,
      login,
      verifyLoginTwoFactor,
      logout,
      logoutAll,
      registerWithCode,
      refreshSession,
      register,
      requestLoginCode,
      requestPasswordResetCode,
      requestRegisterCode,
      resetPasswordWithCode,
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
