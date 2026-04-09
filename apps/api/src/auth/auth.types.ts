import {
  EmailAuthCodePurpose,
  OAuthAccountStatus,
  OrganizationRole,
  OAuthProvider,
} from '@prisma/client';

export type MembershipClaim = {
  organizationId: string;
  role: OrganizationRole;
};

export type AccessTokenPayload = {
  sub: string;
  email: string;
  memberships: MembershipClaim[];
  type: 'access';
};

export type RefreshTokenPayload = {
  sub: string;
  sessionId: string;
  type: 'refresh';
};

export type RequestMeta = {
  userAgent?: string;
  ipAddress?: string;
};

export type PublicUser = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  memberships: MembershipClaim[];
};

export type TokenPair = {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken?: string;
  refreshTokenExpiresAt?: string;
};

export type AuthResponse = {
  user: PublicUser;
  tokens: TokenPair;
  csrfToken?: string;
};

export type MeResponse = {
  user: PublicUser;
};

export type OAuthTokenExchangeResult = {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  email?: string;
  providerUserId?: string;
  tokenType?: string;
  scope?: string;
  expiresAt?: Date;
};

export type NormalizedOAuthProfile = {
  providerUserId: string;
  email?: string;
  emailVerified?: boolean;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
};

export type OAuthProviderDefinition = {
  authorizeUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  defaultScope: string[];
  version?: string;
  authorizeParams?: Record<string, string>;
};

export type OAuthAction = 'login' | 'link';

export type OAuthStatePayload = {
  type: 'oauth_state';
  provider: OAuthProvider;
  action: OAuthAction;
  clientState?: string;
  linkUserId?: string;
  codeVerifier?: string;
  nonce: string;
};

export type OAuthAuthorizationStartResponse = {
  provider: OAuthProvider;
  action: OAuthAction;
  state: string;
  authorizationUrl: string;
};

export type LinkedOAuthAccount = {
  provider: OAuthProvider;
  email: string | null;
  status: OAuthAccountStatus;
  linkedAt: string;
  updatedAt: string;
};

export type OAuthLoginResult = {
  mode: 'login';
  provider: OAuthProvider;
  user: PublicUser;
  tokens: TokenPair;
  clientState?: string | null;
};

export type OAuthLinkResult = {
  mode: 'link';
  provider: OAuthProvider;
  user: PublicUser;
  linked: boolean;
  alreadyLinked: boolean;
  clientState?: string | null;
};

export type OAuthCallbackResult = OAuthLoginResult | OAuthLinkResult;

export type EmailCodeRequestResponse = {
  success: true;
  maskedEmail: string;
  expiresInSeconds: number;
};

export type EmailCodeMessageContext = {
  email: string;
  code: string;
  purpose: EmailAuthCodePurpose;
  expiresInMinutes: number;
};

export const providerNameByEnum: Record<OAuthProvider, string> = {
  GOOGLE: 'google',
  VK: 'vk',
  YANDEX: 'yandex',
};

export const providerByName: Record<string, OAuthProvider> = {
  google: OAuthProvider.GOOGLE,
  vk: OAuthProvider.VK,
  yandex: OAuthProvider.YANDEX,
};

