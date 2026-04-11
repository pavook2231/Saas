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
  twoFactorEnabled: boolean;
  twoFactorRequired: boolean;
};

export type AuthTokens = {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken?: string;
  refreshTokenExpiresAt?: string;
};

export type AuthSuccessResponse = {
  status: 'authenticated';
  user: AuthUser;
  tokens: AuthTokens;
  csrfToken?: string;
};

export type TwoFactorRequiredResponse = {
  status: 'two_factor_required';
  method: 'email_code' | 'totp';
  maskedEmail?: string;
  expiresInSeconds?: number;
};

export type AuthResponse = AuthSuccessResponse | TwoFactorRequiredResponse;

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

export type VerifyLoginTwoFactorPayload = {
  email: string;
  password: string;
  code: string;
};

export type TwoFactorStatus = {
  required: boolean;
  enabled: boolean;
  pending: boolean;
  method: 'totp' | null;
};

export type TotpSetupResponse = {
  required: boolean;
  enabled: boolean;
  pending: true;
  secret: string;
  manualEntryKey: string;
  issuer: string;
  accountName: string;
  otpauthUrl: string;
};

export type TotpSetupPayload = {
  currentPassword?: string;
};

export type TotpTogglePayload = {
  currentPassword?: string;
  code: string;
};

export type RegisterPayload = {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
};

export type EmailCodeRequestPayload = {
  email: string;
};

export type EmailCodeRequestResponse = {
  success: true;
  maskedEmail: string;
  expiresInSeconds: number;
};

export type LoginWithCodePayload = {
  email: string;
  code: string;
};

export type RegisterWithCodePayload = {
  email: string;
  code: string;
  password: string;
  firstName?: string;
  lastName?: string;
  organizationInviteToken?: string;
  participantInviteToken?: string;
};

export type ResetPasswordWithCodePayload = {
  email: string;
  code: string;
  newPassword: string;
};

export type UpdateProfilePayload = {
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
};

export type ChangePasswordPayload = {
  currentPassword?: string;
  newPassword: string;
};

export type OAuthStartResponse = {
  provider: string;
  action: 'login' | 'link';
  state: string;
  authorizationUrl: string;
};
