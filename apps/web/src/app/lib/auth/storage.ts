import { StoredSession } from './types';

const LEGACY_AUTH_STORAGE_KEY = 'saas.auth.session';
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

export const authStorage = {
  load(): StoredSession | null {
    clearLegacySession();
    return null;
  },

  save(_: StoredSession): void {
    clearLegacySession();
  },

  clear(): void {
    clearLegacySession();
  },

  getCsrfToken(): string | null {
    return readCookie(process.env.NEXT_PUBLIC_CSRF_COOKIE_NAME ?? DEFAULT_CSRF_COOKIE_NAME);
  },
};
