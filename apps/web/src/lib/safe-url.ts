const INTERNAL_URL_GUARD_ORIGIN = 'https://app.local';

export const sanitizeInternalPath = (
  value: string | null | undefined,
  fallback: string | null = null,
): string | null => {
  const normalized = value?.trim();

  if (!normalized || !normalized.startsWith('/')) {
    return fallback;
  }

  try {
    const url = new URL(normalized, INTERNAL_URL_GUARD_ORIGIN);

    if (url.origin !== INTERNAL_URL_GUARD_ORIGIN) {
      return fallback;
    }

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
};

export const sanitizeImageSrc = (value: string | null | undefined): string | null => {
  const normalized = value?.trim();

  if (!normalized) {
    return null;
  }

  if (normalized.startsWith('/')) {
    return normalized;
  }

  try {
    const url = new URL(normalized);

    if (url.protocol === 'https:' || url.protocol === 'http:') {
      return url.toString();
    }

    return null;
  } catch {
    return null;
  }
};
