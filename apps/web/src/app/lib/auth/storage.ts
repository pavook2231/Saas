import { StoredSession } from './types';

const LEGACY_AUTH_STORAGE_KEY = 'saas.auth.session';
const AUTH_SESSION_STORAGE_KEY = 'saas.auth.session.v2';
const DEFAULT_CSRF_COOKIE_NAME = 'saas_csrf_token';

const readCookie = (name: string): string | null => {
  if (typeof document === 'undefined') {
    return null;
  }

  const prefix = `${encodeURIComponent(name)}=`;
  const cookie = document.cookie
    .split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith(prefix));

  if (!cookie) {
    return null;
  }

  try {
    return decodeURIComponent(cookie.slice(prefix.length));
  } catch {
    return cookie.slice(prefix.length);
  }
};

const clearLegacySession = () => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(LEGACY_AUTH_STORAGE_KEY);
};

const readSessionStorage = (): Storage | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.sessionStorage;
};

export const authStorage = {
  load(): StoredSession | null {
    clearLegacySession();

    const storage = readSessionStorage();

    if (!storage) {
      return null;
    }

    const raw = storage.getItem(AUTH_SESSION_STORAGE_KEY);

    if (!raw) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw) as StoredSession;

      if (
        !parsed ||
        typeof parsed.accessToken !== 'string' ||
        typeof parsed.accessTokenExpiresAt !== 'string' ||
        typeof parsed.csrfToken !== 'string' ||
        !parsed.user
      ) {
        storage.removeItem(AUTH_SESSION_STORAGE_KEY);
        return null;
      }

      return parsed;
    } catch {
      storage.removeItem(AUTH_SESSION_STORAGE_KEY);
      return null;
    }
  },

  save(session: StoredSession): void {
    clearLegacySession();

    const storage = readSessionStorage();

    if (!storage) {
      return;
    }

    storage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(session));
  },

  clear(): void {
    clearLegacySession();

    const storage = readSessionStorage();
    storage?.removeItem(AUTH_SESSION_STORAGE_KEY);
  },

  getCsrfToken(): string | null {
    return readCookie(process.env.NEXT_PUBLIC_CSRF_COOKIE_NAME ?? DEFAULT_CSRF_COOKIE_NAME);
  },
};
