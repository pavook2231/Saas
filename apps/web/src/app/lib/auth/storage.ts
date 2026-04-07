import { StoredSession } from './types';

const AUTH_STORAGE_KEY = 'saas.auth.session';

export const authStorage = {
  load(): StoredSession | null {
    if (typeof window === 'undefined') {
      return null;
    }

    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);

    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as StoredSession;
    } catch {
      window.localStorage.removeItem(AUTH_STORAGE_KEY);
      return null;
    }
  },

  save(session: StoredSession): void {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
  },

  clear(): void {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.removeItem(AUTH_STORAGE_KEY);
  },
};
