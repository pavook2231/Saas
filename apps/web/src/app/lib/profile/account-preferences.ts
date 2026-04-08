export type AccountPreferences = {
  browserNotifications: boolean;
  emailDigest: boolean;
  interfaceLanguage: 'ru' | 'en';
  interfaceTimezone: string;
};

const STORAGE_KEY = 'saas-platform.account-preferences';

const getDefaultTimezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Moscow';
  } catch {
    return 'Europe/Moscow';
  }
};

export const defaultAccountPreferences = (): AccountPreferences => ({
  browserNotifications: true,
  emailDigest: false,
  interfaceLanguage: 'ru',
  interfaceTimezone: getDefaultTimezone(),
});

export const accountPreferencesStorage = {
  load(): AccountPreferences {
    if (typeof window === 'undefined') {
      return defaultAccountPreferences();
    }

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);

      if (!raw) {
        return defaultAccountPreferences();
      }

      const parsed = JSON.parse(raw) as Partial<AccountPreferences>;

      return {
        ...defaultAccountPreferences(),
        ...parsed,
      };
    } catch {
      return defaultAccountPreferences();
    }
  },

  save(value: AccountPreferences) {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  },
};
