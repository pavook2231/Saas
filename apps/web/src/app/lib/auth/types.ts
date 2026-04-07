export type MembershipRole = 'ADMIN' | 'DIRECTOR' | 'ASSISTANT' | 'MEMBER';

export type MembershipClaim = {
  organizationId: string;
  role: MembershipRole;
};

export type AuthUser = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  memberships: MembershipClaim[];
};

export type AuthTokens = {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken?: string;
  refreshTokenExpiresAt?: string;
};

export type AuthResponse = {
  user: AuthUser;
  tokens: AuthTokens;
  csrfToken?: string;
};

export type MeResponse = {
  user: AuthUser;
};

export type StoredSession = {
  user: AuthUser;
  accessToken: string;
  accessTokenExpiresAt: string;
  csrfToken: string;
};

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

export type OAuthProviderName = 'google' | 'vk' | 'yandex';

export type LoginPayload = {
  email: string;
  password: string;
};

export type RegisterPayload = {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
};

export type OAuthStartResponse = {
  provider: string;
  action: 'login' | 'link';
  state: string;
  authorizationUrl: string;
};
