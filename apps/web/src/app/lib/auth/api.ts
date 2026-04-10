import { sanitizeInternalPath } from '@/lib/safe-url';

import { apiBaseUrl } from '../api/config';

import {
  AuthResponse,
  ChangePasswordPayload,
  EmailCodeRequestPayload,
  EmailCodeRequestResponse,
  LoginPayload,
  LoginWithCodePayload,
  MeResponse,
  OAuthProviderName,
  OAuthStartResponse,
  RegisterPayload,
  RegisterWithCodePayload,
  ResetPasswordWithCodePayload,
  UpdateProfilePayload,
} from './types';

const authBaseUrl = `${apiBaseUrl}/auth`;

const parseApiError = async (response: Response): Promise<string> => {
  const fallback = `Ошибка запроса (${response.status})`;

  try {
    const payload = (await response.json()) as {
      message?: string | string[];
      error?: string;
    };

    if (Array.isArray(payload.message)) {
      return payload.message.join(', ');
    }

    if (typeof payload.message === 'string' && payload.message.trim().length > 0) {
      return payload.message;
    }

    if (typeof payload.error === 'string' && payload.error.trim().length > 0) {
      return payload.error;
    }

    return fallback;
  } catch {
    return fallback;
  }
};

const assertOk = async (response: Response): Promise<Response> => {
  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }

  return response;
};

export const authApi = {
  async login(payload: LoginPayload): Promise<AuthResponse> {
    const response = await fetch(`${authBaseUrl}/login`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    await assertOk(response);
    return (await response.json()) as AuthResponse;
  },

  async register(payload: RegisterPayload): Promise<AuthResponse> {
    const response = await fetch(`${authBaseUrl}/register`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    await assertOk(response);
    return (await response.json()) as AuthResponse;
  },

  async requestLoginCode(
    payload: EmailCodeRequestPayload,
  ): Promise<EmailCodeRequestResponse> {
    const response = await fetch(`${authBaseUrl}/email/login/request`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    await assertOk(response);
    return (await response.json()) as EmailCodeRequestResponse;
  },

  async loginWithCode(payload: LoginWithCodePayload): Promise<AuthResponse> {
    const response = await fetch(`${authBaseUrl}/email/login/verify`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    await assertOk(response);
    return (await response.json()) as AuthResponse;
  },

  async requestRegisterCode(
    payload: EmailCodeRequestPayload,
  ): Promise<EmailCodeRequestResponse> {
    const response = await fetch(`${authBaseUrl}/email/register/request`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    await assertOk(response);
    return (await response.json()) as EmailCodeRequestResponse;
  },

  async registerWithCode(payload: RegisterWithCodePayload): Promise<AuthResponse> {
    const response = await fetch(`${authBaseUrl}/email/register/verify`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    await assertOk(response);
    return (await response.json()) as AuthResponse;
  },

  async requestPasswordResetCode(
    payload: EmailCodeRequestPayload,
  ): Promise<EmailCodeRequestResponse> {
    const response = await fetch(`${authBaseUrl}/email/password/request`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    await assertOk(response);
    return (await response.json()) as EmailCodeRequestResponse;
  },

  async resetPasswordWithCode(
    payload: ResetPasswordWithCodePayload,
  ): Promise<AuthResponse> {
    const response = await fetch(`${authBaseUrl}/email/password/verify`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    await assertOk(response);
    return (await response.json()) as AuthResponse;
  },

  async me(accessToken: string): Promise<MeResponse> {
    const response = await fetch(`${authBaseUrl}/me`, {
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
    });

    await assertOk(response);
    return (await response.json()) as MeResponse;
  },

  async refresh(csrfToken: string): Promise<AuthResponse> {
    const response = await fetch(`${authBaseUrl}/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({}),
    });

    await assertOk(response);
    return (await response.json()) as AuthResponse;
  },

  async logout(csrfToken: string): Promise<void> {
    const response = await fetch(`${authBaseUrl}/logout`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({}),
    });

    await assertOk(response);
  },

  async logoutAll(accessToken: string): Promise<void> {
    const response = await fetch(`${authBaseUrl}/logout-all`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
    });

    await assertOk(response);
  },

  async updateProfile(accessToken: string, payload: UpdateProfilePayload): Promise<MeResponse> {
    const response = await fetch(`${authBaseUrl}/account`, {
      method: 'PATCH',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    await assertOk(response);
    return (await response.json()) as MeResponse;
  },

  async changePassword(
    accessToken: string,
    payload: ChangePasswordPayload,
  ): Promise<{ success: true }> {
    const response = await fetch(`${authBaseUrl}/account/password`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    await assertOk(response);
    return (await response.json()) as { success: true };
  },

  async startOAuth(provider: OAuthProviderName, state: string): Promise<OAuthStartResponse> {
    const safeState = sanitizeInternalPath(state, '/auth/callback') ?? '/auth/callback';
    const params = new URLSearchParams();
    params.set('state', safeState);

    const response = await fetch(`${authBaseUrl}/${provider}?${params.toString()}`, {
      credentials: 'include',
      headers: {
        Accept: 'application/json',
      },
    });

    await assertOk(response);
    return (await response.json()) as OAuthStartResponse;
  },
};
