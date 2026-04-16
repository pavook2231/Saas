import { StoredSession } from './types';

const LEGACY_AUTH_STORAGE_KEY = 'saas.auth.session';
const AUTH_SESSION_STORAGE_KEY = 'saas.auth.session.v2';
const DEFAULT_CSRF_COOKIE_NAME = 'saas_csrf_token';
export const AUTH_SESSION_CHANGED_EVENT = 'saas:auth-session-changed';

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
  const storage = readLocalStorage();

  if (!storage) {
    return;
  }

  storage.removeItem(LEGACY_AUTH_STORAGE_KEY);
};

const readLocalStorage = (): Storage | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const readSessionStorage = (): Storage | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
};

const readStoredSession = (storage: Storage | null): StoredSession | null => {
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
};

const notifySessionChanged = () => {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new Event(AUTH_SESSION_CHANGED_EVENT));
};

export const authStorage = {
  load(): StoredSession | null {
    clearLegacySession();
    return readStoredSession(readSessionStorage());
  },

  save(session: StoredSession): void {
    clearLegacySession();

    const serialized = JSON.stringify(session);
    readSessionStorage()?.setItem(AUTH_SESSION_STORAGE_KEY, serialized);
    notifySessionChanged();
  },

  clear(): void {
    clearLegacySession();

    readSessionStorage()?.removeItem(AUTH_SESSION_STORAGE_KEY);
    notifySessionChanged();
  },

  getCsrfToken(): string | null {
    return readCookie(process.env.NEXT_PUBLIC_CSRF_COOKIE_NAME ?? DEFAULT_CSRF_COOKIE_NAME);
  },
};
