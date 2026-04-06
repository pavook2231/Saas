export const RATE_LIMIT_METADATA_KEY = 'rate-limit:config';

export type RateLimitScope = 'ip' | 'user_or_ip';

export type RateLimitMetadata = {
  limit?: number;
  windowMs?: number;
  scope?: RateLimitScope;
  bucket?: 'api' | 'auth' | 'refresh' | 'oauth';
  skip?: boolean;
};

export const DEFAULT_SECURITY_COOKIE_NAMES = {
  refreshToken: 'saas_refresh_token',
  csrfToken: 'saas_csrf_token',
  oauthState: 'saas_oauth_state',
} as const;
