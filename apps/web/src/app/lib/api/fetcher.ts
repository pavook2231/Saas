import { apiBaseUrl } from './config';

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
  const response = await fetch(buildUrl(path, searchParams), {
    method,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(accessToken
        ? {
            Authorization: `Bearer ${accessToken}`,
          }
        : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  });

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
