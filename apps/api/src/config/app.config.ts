import { registerAs } from '@nestjs/config';

export type OAuthProviderRuntimeConfig = {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
};

export type AppConfig = {
  app: {
    name: string;
    port: number;
    nodeEnv: string;
    corsOrigin: string;
    corsOrigins: string[];
  };
  database: {
    url: string;
  };
  redis: {
    url: string;
  };
  jwt: {
    accessSecret: string;
    accessExpiresIn: string;
    refreshSecret: string;
    refreshExpiresIn: string;
  };
  oauth: {
    google: OAuthProviderRuntimeConfig;
    vk: OAuthProviderRuntimeConfig;
    yandex: OAuthProviderRuntimeConfig;
  };
  firebase: {
    projectId: string;
    clientEmail: string;
    privateKey: string;
    enabled: boolean;
  };
  notifications: {
    reminderOffsetsMinutes: number[];
  };
  security: {
    requireHttps: boolean;
    trustProxy: boolean;
    requestBodyLimit: string;
    dataEncryptionKey: string;
    enforceVerifiedOAuthEmail: boolean;
    cookies: {
      secure: boolean;
      sameSite: 'lax' | 'strict' | 'none';
      domain?: string;
      refreshTokenName: string;
      csrfTokenName: string;
      oauthStateName: string;
    };
    rateLimit: {
      api: {
        limit: number;
        windowMs: number;
      };
      auth: {
        limit: number;
        windowMs: number;
      };
      refresh: {
        limit: number;
        windowMs: number;
      };
      oauth: {
        limit: number;
        windowMs: number;
      };
    };
  };
};

const toInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const requireNonEmpty = (value: string | undefined, envName: string): string => {
  const normalized = value?.trim();

  if (!normalized) {
    throw new Error(`${envName} must be configured`);
  }

  return normalized;
};

const parseMinuteOffsets = (value: string | undefined): number[] => {
  const source = value ?? '1440,60';

  const parsed = source
    .split(',')
    .map((item) => Number.parseInt(item.trim(), 10))
    .filter((item) => Number.isFinite(item) && item > 0);

  const unique = Array.from(new Set(parsed));
  return unique.length > 0 ? unique : [1440, 60];
};

const parseOrigins = (value: string | undefined): string[] => {
  const source = value ?? 'http://localhost:3000';
  const origins = source
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  return origins.length > 0 ? Array.from(new Set(origins)) : ['http://localhost:3000'];
};

const parseSameSite = (
  value: string | undefined,
): 'lax' | 'strict' | 'none' => {
  const normalized = value?.trim().toLowerCase();

  if (normalized === 'strict' || normalized === 'none') {
    return normalized;
  }

  return 'lax';
};

export default registerAs(
  'appConfig',
  (): AppConfig => ({
    app: {
      name: 'saas-platform-api',
      port: toInt(process.env.API_PORT, 3001),
      nodeEnv: process.env.NODE_ENV ?? 'development',
      corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
      corsOrigins: parseOrigins(process.env.CORS_ORIGIN),
    },
    database: {
      url:
        process.env.DATABASE_URL ??
        'postgresql://saas:saas@localhost:5432/saas?schema=public',
    },
    redis: {
      url: process.env.REDIS_URL ?? 'redis://localhost:6379',
    },
    jwt: {
      accessSecret: requireNonEmpty(process.env.JWT_ACCESS_SECRET, 'JWT_ACCESS_SECRET'),
      accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
      refreshSecret: requireNonEmpty(process.env.JWT_REFRESH_SECRET, 'JWT_REFRESH_SECRET'),
      refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '30d',
    },
    oauth: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID ?? '',
        clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
        callbackUrl:
          process.env.GOOGLE_CALLBACK_URL ??
          'http://localhost:3001/api/auth/google/callback',
      },
      vk: {
        clientId: process.env.VK_CLIENT_ID ?? '',
        clientSecret: process.env.VK_CLIENT_SECRET ?? '',
        callbackUrl:
          process.env.VK_CALLBACK_URL ?? 'http://localhost:3001/api/auth/vk/callback',
      },
      yandex: {
        clientId: process.env.YANDEX_CLIENT_ID ?? '',
        clientSecret: process.env.YANDEX_CLIENT_SECRET ?? '',
        callbackUrl:
          process.env.YANDEX_CALLBACK_URL ??
          'http://localhost:3001/api/auth/yandex/callback',
      },
    },
    firebase: {
      projectId: process.env.FIREBASE_PROJECT_ID ?? '',
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL ?? '',
      privateKey: process.env.FIREBASE_PRIVATE_KEY ?? '',
      enabled: Boolean(
        process.env.FIREBASE_PROJECT_ID &&
          process.env.FIREBASE_CLIENT_EMAIL &&
          process.env.FIREBASE_PRIVATE_KEY,
      ),
    },
    notifications: {
      reminderOffsetsMinutes: parseMinuteOffsets(process.env.REMINDER_OFFSETS_MINUTES),
    },
    security: {
      requireHttps: process.env.REQUIRE_HTTPS === 'true',
      trustProxy:
        process.env.TRUST_PROXY === 'true' ||
        (process.env.NODE_ENV ?? 'development') === 'production',
      requestBodyLimit: process.env.REQUEST_BODY_LIMIT ?? '1mb',
      dataEncryptionKey: requireNonEmpty(
        process.env.DATA_ENCRYPTION_KEY,
        'DATA_ENCRYPTION_KEY',
      ),
      enforceVerifiedOAuthEmail: process.env.ENFORCE_VERIFIED_OAUTH_EMAIL !== 'false',
      cookies: {
        secure:
          process.env.COOKIE_SECURE === 'true' ||
          (process.env.NODE_ENV ?? 'development') === 'production',
        sameSite: parseSameSite(process.env.COOKIE_SAME_SITE),
        domain: process.env.COOKIE_DOMAIN?.trim() || undefined,
        refreshTokenName:
          process.env.REFRESH_COOKIE_NAME?.trim() || 'saas_refresh_token',
        csrfTokenName:
          process.env.CSRF_COOKIE_NAME?.trim() || 'saas_csrf_token',
        oauthStateName:
          process.env.OAUTH_STATE_COOKIE_NAME?.trim() || 'saas_oauth_state',
      },
      rateLimit: {
        api: {
          limit: toInt(process.env.RATE_LIMIT_API_LIMIT, 300),
          windowMs: toInt(process.env.RATE_LIMIT_API_WINDOW_MS, 60_000),
        },
        auth: {
          limit: toInt(process.env.RATE_LIMIT_AUTH_LIMIT, 10),
          windowMs: toInt(process.env.RATE_LIMIT_AUTH_WINDOW_MS, 15 * 60_000),
        },
        refresh: {
          limit: toInt(process.env.RATE_LIMIT_REFRESH_LIMIT, 30),
          windowMs: toInt(process.env.RATE_LIMIT_REFRESH_WINDOW_MS, 10 * 60_000),
        },
        oauth: {
          limit: toInt(process.env.RATE_LIMIT_OAUTH_LIMIT, 20),
          windowMs: toInt(process.env.RATE_LIMIT_OAUTH_WINDOW_MS, 10 * 60_000),
        },
      },
    },
  }),
);
