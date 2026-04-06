import { OAuthProvider } from '@prisma/client';

import { NormalizedOAuthProfile, OAuthProviderDefinition } from './auth.types';

export const OAUTH_PROVIDER_DEFINITIONS: Record<OAuthProvider, OAuthProviderDefinition> = {
  GOOGLE: {
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userInfoUrl: 'https://www.googleapis.com/oauth2/v3/userinfo',
    defaultScope: ['openid', 'email', 'profile'],
    authorizeParams: {
      access_type: 'offline',
      include_granted_scopes: 'true',
      prompt: 'consent',
    },
  },
  VK: {
    authorizeUrl: 'https://oauth.vk.com/authorize',
    tokenUrl: 'https://oauth.vk.com/access_token',
    userInfoUrl: 'https://api.vk.com/method/users.get',
    defaultScope: ['email'],
    version: '5.131',
    authorizeParams: {
      display: 'page',
      v: '5.131',
    },
  },
  YANDEX: {
    authorizeUrl: 'https://oauth.yandex.ru/authorize',
    tokenUrl: 'https://oauth.yandex.ru/token',
    userInfoUrl: 'https://login.yandex.ru/info',
    defaultScope: ['login:email', 'login:info'],
    authorizeParams: {
      force_confirm: 'no',
    },
  },
};

const toOptionalString = (value: unknown): string | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
};

const mapGoogleProfile = (raw: Record<string, unknown>): NormalizedOAuthProfile => {
  return {
    providerUserId: toOptionalString(raw.sub) ?? '',
    email: toOptionalString(raw.email),
    emailVerified: raw.email_verified === true,
    firstName: toOptionalString(raw.given_name),
    lastName: toOptionalString(raw.family_name),
    avatarUrl: toOptionalString(raw.picture),
  };
};

const mapVkProfile = (raw: Record<string, unknown>): NormalizedOAuthProfile => {
  const nestedResponse =
    Array.isArray(raw.response) && raw.response.length > 0
      ? (raw.response[0] as Record<string, unknown>)
      : undefined;

  const source = nestedResponse ?? raw;

  return {
    providerUserId:
      toOptionalString(source.id) ??
      toOptionalString(source.user_id) ??
      toOptionalString(raw.user_id) ??
      '',
    email: toOptionalString(raw.email) ?? toOptionalString(source.email),
    emailVerified: Boolean(toOptionalString(raw.email) ?? toOptionalString(source.email)),
    firstName: toOptionalString(source.first_name),
    lastName: toOptionalString(source.last_name),
    avatarUrl:
      toOptionalString(source.photo_200) ??
      toOptionalString(source.photo_max_orig) ??
      toOptionalString(source.avatar),
  };
};

const mapYandexProfile = (raw: Record<string, unknown>): NormalizedOAuthProfile => {
  const avatarId = toOptionalString(raw.default_avatar_id);

  return {
    providerUserId: toOptionalString(raw.id) ?? '',
    email: toOptionalString(raw.default_email),
    emailVerified: Boolean(toOptionalString(raw.default_email)),
    firstName: toOptionalString(raw.first_name),
    lastName: toOptionalString(raw.last_name),
    avatarUrl: avatarId
      ? `https://avatars.yandex.net/get-yapic/${avatarId}/islands-200`
      : undefined,
  };
};

export const mapOAuthProfile = (
  provider: OAuthProvider,
  raw: Record<string, unknown>,
): NormalizedOAuthProfile => {
  if (provider === OAuthProvider.GOOGLE) {
    return mapGoogleProfile(raw);
  }

  if (provider === OAuthProvider.VK) {
    return mapVkProfile(raw);
  }

  return mapYandexProfile(raw);
};
