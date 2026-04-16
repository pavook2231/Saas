import { apiBaseUrl } from './config';
import { authStorage } from '../auth/storage';
import type { AuthUser } from '../auth/types';

type Primitive = string | number | boolean | null | undefined;

type SearchParamsValue =
  | Primitive
  | Primitive[]
  | ReadonlyArray<Primitive>;

type ApiRequestOptions = {
  accessToken?: string | null;
  body?: unknown;
  headers?: Record<string, string>;
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: string;
  searchParams?: Record<string, SearchParamsValue>;
  signal?: AbortSignal;
};

type RefreshResponse = {
  status: 'authenticated';
  user: AuthUser;
  tokens: {
    accessToken: string;
    accessTokenExpiresAt: string;
  };
  csrfToken: string;
};

type ErrorPayload = {
  error?: string;
  message?: string | string[];
  [key: string]: unknown;
};

export class ApiError extends Error {
  status: number;
  payload: ErrorPayload | null;

  constructor(message: string, status: number, payload: ErrorPayload | null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

const isSuccessfulRefreshPayload = (payload: unknown): payload is RefreshResponse => {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const candidate = payload as RefreshResponse;

  return (
    candidate.status === 'authenticated' &&
    typeof candidate.csrfToken === 'string' &&
    typeof candidate.tokens?.accessToken === 'string' &&
    typeof candidate.tokens?.accessTokenExpiresAt === 'string' &&
    candidate.user !== null &&
    candidate.user !== undefined
  );
};

const buildUrl = (
  path: string,
  searchParams?: Record<string, SearchParamsValue>,
): string => {
  const url = new URL(
    path.startsWith('http') ? path : `${apiBaseUrl}${path.startsWith('/') ? path : `/${path}`}`,
  );

  if (!searchParams) {
    return url.toString();
  }

  for (const [key, rawValue] of Object.entries(searchParams)) {
    const values = Array.isArray(rawValue) ? rawValue : [rawValue];

    for (const value of values) {
      if (value === null || value === undefined || value === '') {
        continue;
      }

      url.searchParams.append(key, String(value));
    }
  }

  return url.toString();
};

const readJsonSafely = async (
  response: Response,
): Promise<ErrorPayload | null> => {
  try {
    return (await response.json()) as ErrorPayload;
  } catch {
    return null;
  }
};

const messageFromPayload = (payload: ErrorPayload | null, fallback: string): string => {
  if (!payload) {
    return fallback;
  }

  if (Array.isArray(payload.message) && payload.message.length > 0) {
    return payload.message.join(', ');
  }

  if (typeof payload.message === 'string' && payload.message.trim()) {
    return payload.message;
  }

  if (typeof payload.error === 'string' && payload.error.trim()) {
    return payload.error;
  }

  return fallback;
};

export async function apiRequest<T>({
  accessToken,
  body,
  headers,
  method = 'GET',
  path,
  searchParams,
  signal,
}: ApiRequestOptions): Promise<T> {
  const requestUrl = buildUrl(path, searchParams);
  const requestBody = body !== undefined ? JSON.stringify(body) : undefined;
  const createHeaders = (token: string | null | undefined) => ({
    Accept: 'application/json',
    ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...(token
      ? {
          Authorization: `Bearer ${token}`,
        }
      : {}),
    ...headers,
  });
  const executeRequest = (token: string | null | undefined) =>
    fetch(requestUrl, {
      method,
      credentials: 'include',
      headers: createHeaders(token),
      body: requestBody,
      signal,
    });

  let response = await executeRequest(accessToken);

  const canAttemptRefresh =
    Boolean(accessToken) &&
    response.status === 401 &&
    !path.startsWith('/auth/');

  if (canAttemptRefresh) {
    const csrfToken = authStorage.getCsrfToken();

    if (csrfToken) {
      try {
        const refreshResponse = await fetch(buildUrl('/auth/refresh'), {
          method: 'POST',
          credentials: 'include',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'x-csrf-token': csrfToken,
          },
          body: JSON.stringify({}),
          signal,
        });

        if (refreshResponse.ok) {
          const refreshPayload = (await refreshResponse.json()) as unknown;

          if (isSuccessfulRefreshPayload(refreshPayload)) {
            authStorage.save({
              accessToken: refreshPayload.tokens.accessToken,
              accessTokenExpiresAt: refreshPayload.tokens.accessTokenExpiresAt,
              csrfToken: refreshPayload.csrfToken,
              user: refreshPayload.user,
            });
            response = await executeRequest(refreshPayload.tokens.accessToken);
          }
        }
      } catch {
        // Let the original request error surface below.
      }
    }
  }

  if (!response.ok) {
    const payload = await readJsonSafely(response);
    throw new ApiError(
      messageFromPayload(payload, `Ошибка запроса (${response.status})`),
      response.status,
      payload,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}
