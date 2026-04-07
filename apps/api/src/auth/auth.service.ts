import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  AuditSeverity,
  AuditTargetType,
  MembershipStatus,
  OAuthAccountStatus,
  OAuthProvider,
  OauthStateAction,
  OrganizationInviteStatus,
  ParticipantInviteStatus,
  OrganizationRole,
  Prisma,
  RefreshToken,
} from '@prisma/client';
import { compare, hash } from 'bcryptjs';
import { createHash, randomUUID } from 'crypto';

import { AppConfig, OAuthProviderRuntimeConfig } from '../config/app.config';
import { PrismaService } from '../prisma/prisma.service';

import { OAuthCallbackQueryDto } from './dto/oauth-callback-query.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { mapOAuthProfile, OAUTH_PROVIDER_DEFINITIONS } from './oauth.providers';
import {
  AccessTokenPayload,
  AuthResponse,
  LinkedOAuthAccount,
  MeResponse,
  MembershipClaim,
  OAuthAction,
  OAuthAuthorizationStartResponse,
  OAuthCallbackResult,
  OAuthStatePayload,
  OAuthTokenExchangeResult,
  providerNameByEnum,
  PublicUser,
  RefreshTokenPayload,
  RequestMeta,
  TokenPair,
} from './auth.types';

const OAUTH_STATE_EXPIRES_IN = '10m';
const OAUTH_FETCH_TIMEOUT_MS = 12000;
const PASSWORD_TIMING_RESISTANCE_HASH =
  '$2a$12$C6UzMDM.H6dfI/f/IKcEeO1Q8v1p5MNDoAuCEi0aKBslrHonghE6u';

const publicUserSelect = {
  id: true,
  email: true,
  isEmailVerified: true,
  firstName: true,
  lastName: true,
  avatarUrl: true,
  isActive: true,
  deletedAt: true,
} satisfies Prisma.UserSelect;

const userWithPasswordSelect = {
  ...publicUserSelect,
  passwordHash: true,
} satisfies Prisma.UserSelect;

type RuntimeConfig = {
  appConfig: AppConfig;
};

type PublicUserRecord = Prisma.UserGetPayload<{
  select: typeof publicUserSelect;
}>;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<RuntimeConfig>,
  ) {}

  async register(dto: RegisterDto, requestMeta: RequestMeta): Promise<AuthResponse> {
    const email = this.normalizeEmail(dto.email);
    this.validatePasswordStrength(dto.password);

    const existingUser = await this.prisma.user.findUnique({
      where: { email },
      select: userWithPasswordSelect,
    });

    if (existingUser && existingUser.passwordHash) {
      const canClaimExistingAccount = await this.canClaimExistingAccountByInvite(
        existingUser,
        email,
        dto,
      );

      if (!canClaimExistingAccount) {
        throw new ConflictException('Пользователь с таким email уже существует');
      }
    }

    const passwordHash = await hash(dto.password, 12);

    const initialUser = existingUser
      ? await this.prisma.user.update({
          where: { id: existingUser.id },
          data: {
            passwordHash,
            isActive: true,
            deletedAt: null,
            firstName: this.trimOrNull(dto.firstName) ?? existingUser.firstName,
            lastName: this.trimOrNull(dto.lastName) ?? existingUser.lastName,
            lastLoginAt: new Date(),
          },
          select: publicUserSelect,
        })
      : await this.prisma.user.create({
          data: {
            email,
            passwordHash,
            firstName: this.trimOrNull(dto.firstName),
            lastName: this.trimOrNull(dto.lastName),
            lastLoginAt: new Date(),
          },
          select: publicUserSelect,
        });

    this.assertUserEnabled(initialUser);
    await this.claimInviteTokensForUser(initialUser.id, email, dto);
    await this.claimOrganizationJoinCodeForUser(initialUser.id, dto.organizationJoinCode);

    const user = await this.prisma.user.findUnique({
      where: {
        id: initialUser.id,
      },
      select: publicUserSelect,
    });

    if (!user) {
      throw new UnauthorizedException('Учетная запись пользователя недоступна');
    }

    if (user.isEmailVerified) {
      await this.syncParticipantsForUser(user.id, user.email);
    }

    const memberships = await this.getMembershipClaims(user.id);
    const tokens = await this.createTokenPair(user, memberships, requestMeta);

    return {
      user: this.toPublicUser(user, memberships),
      tokens,
    };
  }

  async login(dto: LoginDto, requestMeta: RequestMeta): Promise<AuthResponse> {
    const email = this.normalizeEmail(dto.email);

    const user = await this.prisma.user.findUnique({
      where: { email },
      select: userWithPasswordSelect,
    });

    if (!user || !user.passwordHash) {
      await compare(dto.password, PASSWORD_TIMING_RESISTANCE_HASH);
      throw new UnauthorizedException('Неверные учетные данные');
    }

    this.assertUserEnabled(user);

    const isValidPassword = await compare(dto.password, user.passwordHash);

    if (!isValidPassword) {
      throw new UnauthorizedException('Неверные учетные данные');
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
      },
      select: publicUserSelect,
    });

    if (updatedUser.isEmailVerified) {
      await this.syncParticipantsForUser(updatedUser.id, updatedUser.email);
    }
    const memberships = await this.getMembershipClaims(updatedUser.id);
    const tokens = await this.createTokenPair(updatedUser, memberships, requestMeta);

    return {
      user: this.toPublicUser(updatedUser, memberships),
      tokens,
    };
  }

  async refresh(
    dto: RefreshTokenDto,
    requestMeta: RequestMeta,
  ): Promise<AuthResponse> {
    if (!dto.refreshToken) {
      throw new BadRequestException('Требуется refresh-токен');
    }

    const payload = await this.verifyRefreshToken(dto.refreshToken);
    const tokenRecord = await this.findValidRefreshTokenRecord(payload, dto.refreshToken);

    await this.prisma.refreshToken.update({
      where: { id: tokenRecord.id },
      data: {
        revokedAt: new Date(),
      },
    });

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: publicUserSelect,
    });

    if (!user) {
      throw new UnauthorizedException('Учетная запись пользователя недоступна');
    }

    this.assertUserEnabled(user);
    if (user.isEmailVerified) {
      await this.syncParticipantsForUser(user.id, user.email);
    }

    const memberships = await this.getMembershipClaims(user.id);
    const tokens = await this.createTokenPair(user, memberships, requestMeta);

    return {
      user: this.toPublicUser(user, memberships),
      tokens,
    };
  }

  async logout(dto: RefreshTokenDto): Promise<void> {
    if (!dto.refreshToken) {
      return;
    }

    try {
      const payload = await this.verifyRefreshToken(dto.refreshToken);
      const tokenHash = this.hashToken(dto.refreshToken);

      await this.prisma.refreshToken.updateMany({
        where: {
          userId: payload.sub,
          sessionId: payload.sessionId,
          tokenHash,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });
    } catch {
      return;
    }
  }

  async logoutAll(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }

  async me(userId: string): Promise<MeResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: publicUserSelect,
    });

    if (!user) {
      throw new UnauthorizedException('Учетная запись пользователя недоступна');
    }

    this.assertUserEnabled(user);

    const memberships = await this.getMembershipClaims(user.id);

    return {
      user: this.toPublicUser(user, memberships),
    };
  }

  async getAuthorizationUrlForLogin(
    provider: OAuthProvider,
    state?: string,
  ): Promise<OAuthAuthorizationStartResponse> {
    return this.buildAuthorizationUrl(provider, 'login', state);
  }

  async getAuthorizationUrlForLink(
    provider: OAuthProvider,
    userId: string,
    state?: string,
  ): Promise<OAuthAuthorizationStartResponse> {
    return this.buildAuthorizationUrl(provider, 'link', state, userId);
  }

  async handleOAuthCallback(
    provider: OAuthProvider,
    query: OAuthCallbackQueryDto,
    requestMeta: RequestMeta,
  ): Promise<OAuthCallbackResult> {
    if (query.error) {
      const suffix = query.error_description
        ? `: ${this.sanitizeOAuthError(query.error_description)}`
        : '';

      throw new UnauthorizedException(
        `OAuth ${providerNameByEnum[provider]} завершился ошибкой (${query.error})${suffix}`,
      );
    }

    const normalizedCode = this.trimOrNull(query.code);

    if (!normalizedCode) {
      throw new BadRequestException('Требуется код авторизации OAuth');
    }

    const statePayload = await this.verifyOAuthState(provider, query.state);

    const providerConfig = this.getOAuthProviderConfig(provider);

    if (!providerConfig.clientId || !providerConfig.clientSecret) {
      throw new ServiceUnavailableException(
        `OAuth ${providerNameByEnum[provider]} credentials are missing`,
      );
    }

    const tokenResult = await this.exchangeCodeForToken(
      provider,
      normalizedCode,
      providerConfig,
    );

    const profile = await this.fetchOAuthProfile(
      provider,
      tokenResult.accessToken,
      providerConfig,
    );

    if (!profile.email && tokenResult.email) {
      profile.email = tokenResult.email;
      if (profile.emailVerified === undefined) {
        profile.emailVerified = true;
      }
    }

    if (!profile.providerUserId && tokenResult.providerUserId) {
      profile.providerUserId = tokenResult.providerUserId;
    }

    if (!profile.providerUserId) {
      throw new UnauthorizedException(
        `Профиль OAuth ${providerNameByEnum[provider]} некорректен`,
      );
    }

    if (statePayload.action === 'link') {
      if (!statePayload.linkUserId) {
        throw new UnauthorizedException('Состояние привязки OAuth недействительно');
      }

      const linking = await this.linkOAuthAccountToUser(
        statePayload.linkUserId,
        provider,
        profile,
        tokenResult,
      );

      const user = await this.getEnabledUserOrThrow(statePayload.linkUserId);
      const memberships = await this.getMembershipClaims(user.id);

      return {
        mode: 'link',
        provider,
        user: this.toPublicUser(user, memberships),
        linked: linking.linked,
        alreadyLinked: linking.alreadyLinked,
        clientState: statePayload.clientState ?? null,
      };
    }

    const userId = await this.resolveUserForOAuthLogin(provider, profile, tokenResult);

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        lastLoginAt: new Date(),
      },
      select: publicUserSelect,
    });

    this.assertUserEnabled(user);
    if (user.isEmailVerified) {
      await this.syncParticipantsForUser(user.id, user.email);
    }

    const memberships = await this.getMembershipClaims(user.id);
    const tokens = await this.createTokenPair(user, memberships, requestMeta);

    return {
      mode: 'login',
      provider,
      user: this.toPublicUser(user, memberships),
      tokens,
      clientState: statePayload.clientState ?? null,
    };
  }

  async listLinkedOAuthAccounts(userId: string): Promise<LinkedOAuthAccount[]> {
    await this.getEnabledUserOrThrow(userId);

    const accounts = await this.prisma.oauthAccount.findMany({
      where: {
        userId,
        status: OAuthAccountStatus.ACTIVE,
      },
      select: {
        provider: true,
        email: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    return accounts.map((account) => ({
      provider: account.provider,
      email: account.email,
      status: account.status,
      linkedAt: account.createdAt.toISOString(),
      updatedAt: account.updatedAt.toISOString(),
    }));
  }

  async unlinkOAuthAccount(userId: string, provider: OAuthProvider): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        passwordHash: true,
        isActive: true,
        deletedAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Учетная запись пользователя недоступна');
    }

    this.assertUserEnabled(user);

    const oauthAccount = await this.prisma.oauthAccount.findUnique({
      where: {
        userId_provider: {
          userId,
          provider,
        },
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!oauthAccount || oauthAccount.status !== OAuthAccountStatus.ACTIVE) {
      throw new NotFoundException(
        `Связанный аккаунт ${providerNameByEnum[provider]} не найден`,
      );
    }

    const activeOAuthCount = await this.prisma.oauthAccount.count({
      where: {
        userId,
        status: OAuthAccountStatus.ACTIVE,
      },
    });

    if (!user.passwordHash && activeOAuthCount <= 1) {
      throw new ForbiddenException(
        'Нельзя отвязать последний активный способ входа без пароля',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.oauthAccount.update({
        where: {
          userId_provider: {
            userId,
            provider,
          },
        },
        data: {
          status: OAuthAccountStatus.REVOKED,
          accessToken: null,
          refreshToken: null,
          idToken: null,
          tokenType: null,
          scopes: null,
          expiresAt: null,
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: userId,
          targetType: AuditTargetType.AUTH,
          targetId: userId,
          action: 'auth.oauth.unlinked',
          severity: AuditSeverity.INFO,
          payload: {
            provider,
          },
        },
      });
    });
  }

  private async buildAuthorizationUrl(
    provider: OAuthProvider,
    action: OAuthAction,
    clientState?: string,
    linkUserId?: string,
  ): Promise<OAuthAuthorizationStartResponse> {
    const providerConfig = this.getOAuthProviderConfig(provider);

    if (!providerConfig.clientId || !providerConfig.callbackUrl) {
      throw new ServiceUnavailableException(
        `OAuth ${providerNameByEnum[provider]} configuration is incomplete`,
      );
    }

    const definition = OAUTH_PROVIDER_DEFINITIONS[provider];
    const normalizedClientState = this.trimOrNull(clientState) ?? undefined;

    const statePayload: OAuthStatePayload = {
      type: 'oauth_state',
      provider,
      action,
      clientState: normalizedClientState,
      linkUserId: action === 'link' ? linkUserId : undefined,
      nonce: randomUUID(),
    };

    await this.prisma.oauthState.create({
      data: {
        nonce: statePayload.nonce,
        provider,
        action: action === 'link' ? OauthStateAction.LINK : OauthStateAction.LOGIN,
        linkUserId: action === 'link' ? linkUserId : null,
        clientState: normalizedClientState ?? null,
        expiresAt: new Date(Date.now() + this.parseDurationToMs(OAUTH_STATE_EXPIRES_IN)),
      },
    });

    const signedState = this.jwtService.sign(statePayload, {
      secret: this.getConfig().jwt.accessSecret,
      expiresIn: OAUTH_STATE_EXPIRES_IN,
      issuer: this.getConfig().app.name,
      subject: action === 'link' ? linkUserId : undefined,
      audience: 'oauth-state',
    });

    const queryParams = new URLSearchParams({
      response_type: 'code',
      client_id: providerConfig.clientId,
      redirect_uri: providerConfig.callbackUrl,
      state: signedState,
    });

    if (definition.defaultScope.length > 0) {
      queryParams.set('scope', definition.defaultScope.join(' '));
    }

    if (definition.authorizeParams) {
      for (const [key, value] of Object.entries(definition.authorizeParams)) {
        queryParams.set(key, value);
      }
    }

    return {
      provider,
      action,
      state: signedState,
      authorizationUrl: `${definition.authorizeUrl}?${queryParams.toString()}`,
    };
  }

  private async verifyOAuthState(
    provider: OAuthProvider,
    state?: string,
  ): Promise<OAuthStatePayload> {
    if (!state) {
      throw new BadRequestException('Требуется состояние OAuth');
    }

    try {
      const payload = this.jwtService.verify<OAuthStatePayload>(state, {
        secret: this.getConfig().jwt.accessSecret,
        issuer: this.getConfig().app.name,
        audience: 'oauth-state',
      });

      if (
        payload.type !== 'oauth_state' ||
        payload.provider !== provider ||
        (payload.action !== 'login' && payload.action !== 'link')
      ) {
        throw new UnauthorizedException('Состояние OAuth недействительно');
      }

      if (payload.action === 'link' && !payload.linkUserId) {
        throw new UnauthorizedException('Состояние привязки OAuth недействительно');
      }

      const consumed = await this.prisma.oauthState.updateMany({
        where: {
          nonce: payload.nonce,
          provider,
          action:
            payload.action === 'link' ? OauthStateAction.LINK : OauthStateAction.LOGIN,
          linkUserId: payload.linkUserId ?? null,
          consumedAt: null,
          expiresAt: {
            gt: new Date(),
          },
        },
        data: {
          consumedAt: new Date(),
        },
      });

      if (consumed.count !== 1) {
        throw new UnauthorizedException('Состояние OAuth недействительно');
      }

      return payload;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      throw new UnauthorizedException('Состояние OAuth недействительно');
    }
  }

  private async resolveUserForOAuthLogin(
    provider: OAuthProvider,
    profile: {
      providerUserId: string;
      email?: string;
      emailVerified?: boolean;
      firstName?: string;
      lastName?: string;
      avatarUrl?: string;
    },
    tokenResult: OAuthTokenExchangeResult,
  ): Promise<string> {
    const byIdentity = await this.prisma.oauthAccount.findUnique({
      where: {
        provider_providerUserId: {
          provider,
          providerUserId: profile.providerUserId,
        },
      },
      select: {
        userId: true,
      },
    });

    if (byIdentity) {
      await this.linkOAuthAccountToUser(byIdentity.userId, provider, profile, tokenResult);
      return byIdentity.userId;
    }

    const normalizedEmail =
      profile.email && this.shouldTrustOAuthEmail(profile)
        ? this.normalizeEmail(profile.email)
        : null;

    let userId: string;

    if (normalizedEmail) {
      const existingUser = await this.prisma.user.findUnique({
        where: {
          email: normalizedEmail,
        },
        select: {
          id: true,
          isActive: true,
          deletedAt: true,
        },
      });

      if (existingUser) {
        if (!existingUser.isActive || existingUser.deletedAt !== null) {
          throw new UnauthorizedException('Учетная запись пользователя отключена');
        }

        userId = existingUser.id;
      } else {
        userId = (
          await this.prisma.user.create({
            data: {
              email: normalizedEmail,
              isEmailVerified: true,
              firstName: this.trimOrNull(profile.firstName),
              lastName: this.trimOrNull(profile.lastName),
              avatarUrl: this.trimOrNull(profile.avatarUrl),
              passwordHash: null,
              isActive: true,
            },
            select: {
              id: true,
            },
          })
        ).id;
      }
    } else {
      userId = (
        await this.prisma.user.create({
          data: {
            email: this.generateSyntheticOAuthEmail(provider, profile.providerUserId),
            isEmailVerified: Boolean(profile.email && profile.emailVerified),
            firstName: this.trimOrNull(profile.firstName),
            lastName: this.trimOrNull(profile.lastName),
            avatarUrl: this.trimOrNull(profile.avatarUrl),
            passwordHash: null,
            isActive: true,
          },
          select: {
            id: true,
          },
        })
      ).id;
    }

    await this.linkOAuthAccountToUser(userId, provider, profile, tokenResult);

    return userId;
  }

  private async linkOAuthAccountToUser(
    userId: string,
    provider: OAuthProvider,
    profile: {
      providerUserId: string;
      email?: string;
      emailVerified?: boolean;
      firstName?: string;
      lastName?: string;
      avatarUrl?: string;
    },
    tokenResult: OAuthTokenExchangeResult,
  ): Promise<{ linked: boolean; alreadyLinked: boolean }> {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          isEmailVerified: true,
          isActive: true,
          deletedAt: true,
        },
      });

      if (!user || !user.isActive || user.deletedAt) {
        throw new UnauthorizedException('Целевой пользователь недоступен для привязки');
      }

      const identityAccount = await tx.oauthAccount.findUnique({
        where: {
          provider_providerUserId: {
            provider,
            providerUserId: profile.providerUserId,
          },
        },
        select: {
          id: true,
          userId: true,
          status: true,
          providerUserId: true,
        },
      });

      const accountData = {
        email:
          profile.email && this.shouldTrustOAuthEmail(profile)
            ? this.normalizeEmail(profile.email)
            : null,
        accessToken: null,
        refreshToken: null,
        idToken: null,
        tokenType: tokenResult.tokenType ?? null,
        scopes: tokenResult.scope ?? null,
        expiresAt: tokenResult.expiresAt ?? null,
        status: OAuthAccountStatus.ACTIVE,
      } satisfies Prisma.OauthAccountUncheckedUpdateInput;

      if (identityAccount) {
        if (identityAccount.userId !== userId) {
          throw new ConflictException(
            `Этот аккаунт ${providerNameByEnum[provider]} уже привязан к другому пользователю`,
          );
        }

        await tx.oauthAccount.update({
          where: { id: identityAccount.id },
          data: accountData,
        });

        await this.promoteVerifiedEmailFromOAuth(tx, user, profile);

        await tx.auditLog.create({
          data: {
            actorUserId: userId,
            targetType: AuditTargetType.AUTH,
            targetId: userId,
            action: 'auth.oauth.linked',
            severity: AuditSeverity.INFO,
            payload: {
              provider,
              reactivated: identityAccount.status !== OAuthAccountStatus.ACTIVE,
            },
          },
        });

        return {
          linked: true,
          alreadyLinked: identityAccount.status === OAuthAccountStatus.ACTIVE,
        };
      }

      const existingProviderAccount = await tx.oauthAccount.findUnique({
        where: {
          userId_provider: {
            userId,
            provider,
          },
        },
        select: {
          id: true,
          providerUserId: true,
          status: true,
        },
      });

      if (existingProviderAccount) {
        if (existingProviderAccount.providerUserId !== profile.providerUserId) {
          throw new ConflictException(
            `У пользователя уже привязан другой аккаунт ${providerNameByEnum[provider]}`,
          );
        }

        await tx.oauthAccount.update({
          where: {
            userId_provider: {
              userId,
              provider,
            },
          },
          data: accountData,
        });

        await this.promoteVerifiedEmailFromOAuth(tx, user, profile);

        await tx.auditLog.create({
          data: {
            actorUserId: userId,
            targetType: AuditTargetType.AUTH,
            targetId: userId,
            action: 'auth.oauth.linked',
            severity: AuditSeverity.INFO,
            payload: {
              provider,
              reactivated:
                existingProviderAccount.status !== OAuthAccountStatus.ACTIVE,
            },
          },
        });

        return {
          linked: true,
          alreadyLinked: existingProviderAccount.status === OAuthAccountStatus.ACTIVE,
        };
      }

      await tx.oauthAccount.create({
        data: {
          userId,
          provider,
          providerUserId: profile.providerUserId,
          ...accountData,
        },
      });

      await this.promoteVerifiedEmailFromOAuth(tx, user, profile);

      await tx.auditLog.create({
        data: {
          actorUserId: userId,
          targetType: AuditTargetType.AUTH,
          targetId: userId,
          action: 'auth.oauth.linked',
          severity: AuditSeverity.INFO,
          payload: {
            provider,
            reactivated: false,
          },
        },
      });

      return {
        linked: true,
        alreadyLinked: false,
      };
    });
  }

  private async exchangeCodeForToken(
    provider: OAuthProvider,
    code: string,
    providerConfig: OAuthProviderRuntimeConfig,
  ): Promise<OAuthTokenExchangeResult> {
    const definition = OAUTH_PROVIDER_DEFINITIONS[provider];

    let response: Response;

    if (provider === OAuthProvider.VK) {
      const url = new URL(definition.tokenUrl);
      url.searchParams.set('grant_type', 'authorization_code');
      url.searchParams.set('code', code);
      url.searchParams.set('client_id', providerConfig.clientId);
      url.searchParams.set('client_secret', providerConfig.clientSecret);
      url.searchParams.set('redirect_uri', providerConfig.callbackUrl);
      url.searchParams.set('v', definition.version ?? '5.131');

      response = await this.safeFetch(url, {
        method: 'GET',
      });
    } else {
      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: providerConfig.clientId,
        client_secret: providerConfig.clientSecret,
        redirect_uri: providerConfig.callbackUrl,
      });

      response = await this.safeFetch(definition.tokenUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
        },
        body,
      });
    }

    const payload = await this.readJsonObject(response);

    if (!response.ok || this.hasOAuthError(payload)) {
      this.logger.warn(
        `OAuth token exchange failed for ${providerNameByEnum[provider]}`,
      );
      throw new UnauthorizedException(
        `Не удалось обменять токен OAuth ${providerNameByEnum[provider]}`,
      );
    }

    const accessToken = this.pickString(payload, ['access_token']);

    if (!accessToken) {
      throw new UnauthorizedException('Отсутствует access token OAuth');
    }

    const expiresIn = this.pickNumber(payload, ['expires_in']);

    return {
      accessToken,
      refreshToken: this.pickString(payload, ['refresh_token']),
      idToken: this.pickString(payload, ['id_token']),
      email: this.pickString(payload, ['email']),
      providerUserId: this.pickString(payload, ['user_id']),
      tokenType: this.pickString(payload, ['token_type']),
      scope: this.pickString(payload, ['scope']),
      expiresAt:
        typeof expiresIn === 'number'
          ? new Date(Date.now() + expiresIn * 1000)
          : undefined,
    };
  }

  private async fetchOAuthProfile(
    provider: OAuthProvider,
    accessToken: string,
    _providerConfig: OAuthProviderRuntimeConfig,
  ): Promise<{
    providerUserId: string;
    email?: string;
    emailVerified?: boolean;
    firstName?: string;
    lastName?: string;
    avatarUrl?: string;
  }> {
    const definition = OAUTH_PROVIDER_DEFINITIONS[provider];

    let response: Response;

    if (provider === OAuthProvider.VK) {
      const url = new URL(definition.userInfoUrl);
      url.searchParams.set('access_token', accessToken);
      url.searchParams.set('fields', 'photo_200,photo_max_orig');
      url.searchParams.set('v', definition.version ?? '5.131');

      response = await this.safeFetch(url, {
        method: 'GET',
      });
    } else if (provider === OAuthProvider.YANDEX) {
      const url = new URL(definition.userInfoUrl);
      url.searchParams.set('format', 'json');

      response = await this.safeFetch(url, {
        method: 'GET',
        headers: {
          Authorization: `OAuth ${accessToken}`,
        },
      });
    } else {
      response = await this.safeFetch(definition.userInfoUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
    }

    const payload = await this.readJsonObject(response);

    if (!response.ok || this.hasOAuthError(payload)) {
      this.logger.warn(
        `OAuth profile fetch failed for ${providerNameByEnum[provider]}`,
      );
      throw new UnauthorizedException(
        `Не удалось получить профиль OAuth ${providerNameByEnum[provider]}`,
      );
    }

    return mapOAuthProfile(provider, payload);
  }

  private async findValidRefreshTokenRecord(
    payload: RefreshTokenPayload,
    refreshToken: string,
  ): Promise<RefreshToken> {
    const tokenRecord = await this.prisma.refreshToken.findUnique({
      where: {
        sessionId: payload.sessionId,
      },
    });

    if (!tokenRecord) {
      throw new UnauthorizedException('Refresh-сессия не существует');
    }

    if (tokenRecord.userId !== payload.sub) {
      throw new UnauthorizedException('Пользователь refresh-сессии не совпадает');
    }

    if (tokenRecord.revokedAt) {
      throw new UnauthorizedException('Refresh-сессия отозвана');
    }

    if (tokenRecord.expiresAt <= new Date()) {
      throw new UnauthorizedException('Срок действия refresh-сессии истек');
    }

    const incomingTokenHash = this.hashToken(refreshToken);

    if (tokenRecord.tokenHash !== incomingTokenHash) {
      await this.prisma.refreshToken.updateMany({
        where: {
          userId: payload.sub,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });

      throw new UnauthorizedException('Обнаружено повторное использование refresh-токена');
    }

    return tokenRecord;
  }

  private async verifyRefreshToken(refreshToken: string): Promise<RefreshTokenPayload> {
    try {
      const payload = await this.jwtService.verifyAsync<RefreshTokenPayload>(
        refreshToken,
        {
          secret: this.getConfig().jwt.refreshSecret,
          issuer: this.getConfig().app.name,
          audience: 'auth-refresh',
        },
      );

      if (
        payload.type !== 'refresh' ||
        typeof payload.sub !== 'string' ||
        typeof payload.sessionId !== 'string'
      ) {
        throw new UnauthorizedException('Некорректное содержимое refresh-токена');
      }

      return payload;
    } catch {
      throw new UnauthorizedException('Недействительный refresh-токен');
    }
  }

  private async createTokenPair(
    user: PublicUserRecord,
    memberships: MembershipClaim[],
    requestMeta: RequestMeta,
  ): Promise<TokenPair> {
    const config = this.getConfig();

    const accessPayload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      memberships,
      type: 'access',
    };

    const refreshPayload: RefreshTokenPayload = {
      sub: user.id,
      sessionId: randomUUID(),
      type: 'refresh',
    };

    const accessToken = await this.jwtService.signAsync(accessPayload, {
      secret: config.jwt.accessSecret,
      expiresIn: config.jwt.accessExpiresIn,
      issuer: config.app.name,
      audience: 'auth-access',
    });

    const refreshToken = await this.jwtService.signAsync(refreshPayload, {
      secret: config.jwt.refreshSecret,
      expiresIn: config.jwt.refreshExpiresIn,
      issuer: config.app.name,
      audience: 'auth-refresh',
    });

    const accessTokenExpiresAt = this.resolveTokenExpiryDate(
      accessToken,
      config.jwt.accessExpiresIn,
    );
    const refreshTokenExpiresAt = this.resolveTokenExpiryDate(
      refreshToken,
      config.jwt.refreshExpiresIn,
    );

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        sessionId: refreshPayload.sessionId,
        tokenHash: this.hashToken(refreshToken),
        userAgent: requestMeta.userAgent ?? null,
        ipAddress: requestMeta.ipAddress ?? null,
        expiresAt: refreshTokenExpiresAt,
      },
    });

    return {
      accessToken,
      accessTokenExpiresAt: accessTokenExpiresAt.toISOString(),
      refreshToken,
      refreshTokenExpiresAt: refreshTokenExpiresAt.toISOString(),
    };
  }

  private toPublicUser(
    user: PublicUserRecord,
    memberships: MembershipClaim[],
  ): PublicUser {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      avatarUrl: user.avatarUrl,
      memberships,
    };
  }

  private async getMembershipClaims(userId: string): Promise<MembershipClaim[]> {
    const memberships = await this.prisma.membership.findMany({
      where: {
        userId,
        status: MembershipStatus.ACTIVE,
      },
      select: {
        organizationId: true,
        role: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    return memberships.map((membership) => ({
      organizationId: membership.organizationId,
      role: membership.role as OrganizationRole,
    }));
  }

  private async getEnabledUserOrThrow(userId: string): Promise<PublicUserRecord> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: publicUserSelect,
    });

    if (!user) {
      throw new UnauthorizedException('Учетная запись пользователя недоступна');
    }

    this.assertUserEnabled(user);

    return user;
  }

  private async syncParticipantsForUser(
    userId: string,
    email: string | null,
  ): Promise<void> {
    const normalizedEmail = email ? this.normalizeEmail(email) : null;

    if (!normalizedEmail) {
      return;
    }

    const candidates = await this.prisma.participant.findMany({
      where: {
        email: normalizedEmail,
        userId: null,
        deletedAt: null,
        organization: {
          deletedAt: null,
        },
      },
      select: {
        id: true,
        organizationId: true,
        firstName: true,
        lastName: true,
        displayName: true,
      },
      orderBy: [{ createdAt: 'asc' }],
    });

    if (candidates.length === 0) {
      return;
    }

    const candidatesByOrganization = new Map<
      string,
      Array<{
        id: string;
        organizationId: string;
        firstName: string;
        lastName: string;
        displayName: string | null;
      }>
    >();

    for (const candidate of candidates) {
      const group = candidatesByOrganization.get(candidate.organizationId) ?? [];
      group.push(candidate);
      candidatesByOrganization.set(candidate.organizationId, group);
    }

    const organizationIds = Array.from(candidatesByOrganization.keys());
    const linkedParticipants = await this.prisma.participant.findMany({
      where: {
        organizationId: {
          in: organizationIds,
        },
        userId,
      },
      select: {
        organizationId: true,
      },
    });
    const linkedOrganizationIds = new Set(
      linkedParticipants.map((participant) => participant.organizationId),
    );
    const linkedAt = new Date();

    await this.prisma.$transaction(async (tx) => {
      for (const [organizationId, group] of candidatesByOrganization.entries()) {
        if (linkedOrganizationIds.has(organizationId)) {
          continue;
        }

        if (group.length !== 1) {
          this.logger.warn(
            `Skipped participant auto-link for user=${userId} organization=${organizationId}: duplicate participants for email ${normalizedEmail}`,
          );
          continue;
        }

        const participant = group[0];

        await tx.participant.update({
          where: {
            id: participant.id,
          },
          data: {
            userId,
            linkedAt,
            invitationStatus: ParticipantInviteStatus.ACCEPTED,
          },
        });

        await tx.participantInvite.updateMany({
          where: {
            participantId: participant.id,
            status: ParticipantInviteStatus.PENDING,
          },
          data: {
            status: ParticipantInviteStatus.ACCEPTED,
            acceptedAt: linkedAt,
          },
        });

        await tx.auditLog.create({
          data: {
            organizationId,
            actorUserId: userId,
            targetType: AuditTargetType.PARTICIPANT,
            targetId: participant.id,
            action: 'participant.auto-linked',
            severity: AuditSeverity.INFO,
            description: 'Participant was linked to user automatically',
            payload: this.toAuditPayload({
              email: normalizedEmail,
              participantName:
                participant.displayName ??
                `${participant.firstName} ${participant.lastName}`.trim(),
            }),
          },
        });
      }
    });
  }

  private assertUserEnabled(user: { isActive: boolean; deletedAt: Date | null }): void {
    if (!user.isActive || user.deletedAt !== null) {
      throw new UnauthorizedException('Пользователь деактивирован');
    }
  }

  private resolveTokenExpiryDate(token: string, fallback: string): Date {
    const decoded = this.jwtService.decode(token);

    if (
      decoded &&
      typeof decoded === 'object' &&
      'exp' in decoded &&
      typeof decoded.exp === 'number'
    ) {
      return new Date(decoded.exp * 1000);
    }

    return new Date(Date.now() + this.parseDurationToMs(fallback));
  }

  private parseDurationToMs(value: string): number {
    const normalized = value.trim();

    if (/^\d+$/.test(normalized)) {
      return Number.parseInt(normalized, 10) * 1000;
    }

    const match = normalized.match(/^(\d+)(s|m|h|d)$/i);

    if (!match) {
      return 30 * 24 * 60 * 60 * 1000;
    }

    const amount = Number.parseInt(match[1], 10);
    const unit = match[2].toLowerCase();

    const multiplierByUnit: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };

    return amount * (multiplierByUnit[unit] ?? 1000);
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private async claimInviteTokensForUser(
    userId: string,
    email: string,
    dto: RegisterDto,
  ): Promise<void> {
    if (dto.organizationInviteToken) {
      await this.claimOrganizationInviteForUser(userId, email, dto.organizationInviteToken);
    }

    if (dto.participantInviteToken) {
      await this.claimParticipantInviteForUser(userId, email, dto.participantInviteToken);
    }
  }

  private async claimOrganizationJoinCodeForUser(
    userId: string,
    inviteCode?: string,
  ): Promise<void> {
    const normalizedInviteCode = inviteCode?.trim().toLowerCase();

    if (!normalizedInviteCode) {
      return;
    }

    const organization = await this.prisma.organization.findFirst({
      where: {
        inviteCode: normalizedInviteCode,
        deletedAt: null,
      },
      select: {
        id: true,
        inviteCode: true,
        createdByUserId: true,
      },
    });

    if (!organization) {
      throw new UnauthorizedException('Код вступления в организацию недействителен');
    }

    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      const existingMembership = await tx.membership.findUnique({
        where: {
          organizationId_userId: {
            organizationId: organization.id,
            userId,
          },
        },
        select: {
          id: true,
          role: true,
          status: true,
        },
      });

      if (existingMembership?.status === MembershipStatus.ACTIVE) {
        return;
      }

      if (existingMembership) {
        await tx.membership.update({
          where: { id: existingMembership.id },
          data: {
            role: existingMembership.role,
            status: MembershipStatus.ACTIVE,
            invitedByUserId: organization.createdByUserId ?? null,
            invitedAt: now,
            acceptedAt: now,
            leftAt: null,
            suspendedAt: null,
          },
        });
      } else {
        await tx.membership.create({
          data: {
            organizationId: organization.id,
            userId,
            role: OrganizationRole.MEMBER,
            status: MembershipStatus.ACTIVE,
            invitedByUserId: organization.createdByUserId ?? null,
            invitedAt: now,
            acceptedAt: now,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          organizationId: organization.id,
          actorUserId: userId,
          targetType: AuditTargetType.MEMBERSHIP,
          targetId: organization.id,
          action: 'membership.joined_by_code_registration',
          description: 'Organization joined by invite code during registration',
          payload: {
            inviteCode: organization.inviteCode,
          },
        },
      });
    });
  }

  private async claimOrganizationInviteForUser(
    userId: string,
    email: string,
    inviteToken: string,
  ): Promise<void> {
    const tokenHash = this.hashToken(inviteToken);
    const normalizedEmail = this.normalizeEmail(email);
    const invite = await this.prisma.organizationInvite.findFirst({
      where: {
        tokenHash,
        email: normalizedEmail,
        status: OrganizationInviteStatus.PENDING,
        revokedAt: null,
        expiresAt: {
          gt: new Date(),
        },
        organization: {
          deletedAt: null,
        },
      },
      select: {
        id: true,
        organizationId: true,
        role: true,
        invitedByUserId: true,
      },
    });

    if (!invite) {
      throw new UnauthorizedException('Токен приглашения в организацию недействителен');
    }

    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      const membership = await tx.membership.findUnique({
        where: {
          organizationId_userId: {
            organizationId: invite.organizationId,
            userId,
          },
        },
        select: {
          id: true,
        },
      });

      if (membership) {
        await tx.membership.update({
          where: {
            id: membership.id,
          },
          data: {
            role: invite.role,
            status: MembershipStatus.ACTIVE,
            invitedByUserId: invite.invitedByUserId,
            invitedAt: now,
            acceptedAt: now,
          },
        });
      } else {
        await tx.membership.create({
          data: {
            organizationId: invite.organizationId,
            userId,
            role: invite.role,
            status: MembershipStatus.ACTIVE,
            invitedByUserId: invite.invitedByUserId,
            invitedAt: now,
            acceptedAt: now,
          },
        });
      }

      await tx.organizationInvite.update({
        where: {
          id: invite.id,
        },
        data: {
          status: OrganizationInviteStatus.ACCEPTED,
          acceptedByUserId: userId,
          acceptedAt: now,
        },
      });

      await tx.user.update({
        where: {
          id: userId,
        },
        data: {
          isEmailVerified: true,
        },
      });
    });
  }

  private async claimParticipantInviteForUser(
    userId: string,
    email: string,
    inviteToken: string,
  ): Promise<void> {
    const tokenHash = this.hashToken(inviteToken);
    const normalizedEmail = this.normalizeEmail(email);
    const invite = await this.prisma.participantInvite.findFirst({
      where: {
        tokenHash,
        email: normalizedEmail,
        status: ParticipantInviteStatus.PENDING,
        revokedAt: null,
        expiresAt: {
          gt: new Date(),
        },
        organization: {
          deletedAt: null,
        },
        participant: {
          deletedAt: null,
        },
      },
      select: {
        id: true,
        organizationId: true,
        participantId: true,
        participant: {
          select: {
            userId: true,
          },
        },
      },
    });

    if (!invite) {
      throw new UnauthorizedException('Токен приглашения участника недействителен');
    }

    if (invite.participant.userId && invite.participant.userId !== userId) {
      throw new ConflictException('Участник уже связан с другим пользователем');
    }

    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.participant.update({
        where: {
          id: invite.participantId,
        },
        data: {
          userId,
          linkedAt: now,
          invitationStatus: ParticipantInviteStatus.ACCEPTED,
        },
      });

      await tx.participantInvite.update({
        where: {
          id: invite.id,
        },
        data: {
          status: ParticipantInviteStatus.ACCEPTED,
          acceptedAt: now,
        },
      });

      await tx.user.update({
        where: {
          id: userId,
        },
        data: {
          isEmailVerified: true,
        },
      });
    });
  }

  private validatePasswordStrength(password: string): void {
    const normalized = password.trim();

    if (!/[a-z]/.test(normalized) || !/[A-Z]/.test(normalized) || !/\d/.test(normalized)) {
      throw new BadRequestException(
        'Пароль должен содержать заглавные и строчные буквы, а также цифры',
      );
    }
  }

  private trimOrNull(value?: string | null): string | null {
    if (!value) {
      return null;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private generateSyntheticOAuthEmail(
    provider: OAuthProvider,
    providerUserId: string,
  ): string {
    const deterministicHash = createHash('sha256')
      .update(`${provider}:${providerUserId}`)
      .digest('hex')
      .slice(0, 16);

    return `${providerNameByEnum[provider]}_${deterministicHash}@oauth.local`;
  }

  private getOAuthProviderConfig(
    provider: OAuthProvider,
  ): OAuthProviderRuntimeConfig {
    const config = this.getConfig();

    if (provider === OAuthProvider.GOOGLE) {
      return config.oauth.google;
    }

    if (provider === OAuthProvider.VK) {
      return config.oauth.vk;
    }

    return config.oauth.yandex;
  }

  private sanitizeOAuthError(value: string): string {
    return value.replace(/\s+/g, ' ').trim().slice(0, 240);
  }

  private async canClaimExistingAccountByInvite(
    existingUser: {
      isEmailVerified: boolean;
      deletedAt: Date | null;
      isActive: boolean;
    },
    email: string,
    dto: RegisterDto,
  ): Promise<boolean> {
    if (existingUser.isEmailVerified) {
      return false;
    }

    const normalizedEmail = this.normalizeEmail(email);
    const candidateHashes = [
      dto.organizationInviteToken ? this.hashToken(dto.organizationInviteToken) : null,
      dto.participantInviteToken ? this.hashToken(dto.participantInviteToken) : null,
    ].filter((value) => typeof value === 'string');

    if (candidateHashes.length === 0) {
      return false;
    }

    const [organizationInvite, participantInvite] = await Promise.all([
      this.prisma.organizationInvite.findFirst({
        where: {
          email: normalizedEmail,
          tokenHash: {
            in: candidateHashes,
          },
          status: OrganizationInviteStatus.PENDING,
          revokedAt: null,
          expiresAt: {
            gt: new Date(),
          },
        },
        select: {
          id: true,
        },
      }),
      this.prisma.participantInvite.findFirst({
        where: {
          email: normalizedEmail,
          tokenHash: {
            in: candidateHashes,
          },
          status: ParticipantInviteStatus.PENDING,
          revokedAt: null,
          expiresAt: {
            gt: new Date(),
          },
        },
        select: {
          id: true,
        },
      }),
    ]);

    return Boolean(organizationInvite || participantInvite);
  }

  private shouldTrustOAuthEmail(profile: {
    email?: string;
    emailVerified?: boolean;
  }): boolean {
    if (!profile.email) {
      return false;
    }

    if (!this.getConfig().security.enforceVerifiedOAuthEmail) {
      return true;
    }

    return profile.emailVerified === true;
  }

  private async promoteVerifiedEmailFromOAuth(
    tx: Prisma.TransactionClient,
    user: {
      id: string;
      email: string;
      isEmailVerified: boolean;
    },
    profile: {
      email?: string;
      emailVerified?: boolean;
    },
  ): Promise<void> {
    if (!this.shouldTrustOAuthEmail(profile) || !profile.email) {
      return;
    }

    const normalizedEmail = this.normalizeEmail(profile.email);

    if (normalizedEmail !== user.email || user.isEmailVerified) {
      return;
    }

    await tx.user.update({
      where: {
        id: user.id,
      },
      data: {
        isEmailVerified: true,
      },
    });
  }

  private getConfig(): AppConfig {
    const config = this.configService.get<AppConfig>('appConfig');

    if (!config) {
      throw new InternalServerErrorException('Конфигурация приложения отсутствует');
    }

    return config;
  }

  private hasOAuthError(payload: Record<string, unknown>): boolean {
    const stringError = this.pickString(payload, ['error', 'error_description']);

    if (stringError) {
      return true;
    }

    const errorField = payload.error;

    return typeof errorField === 'object' && errorField !== null;
  }

  private pickString(
    payload: Record<string, unknown>,
    keys: string[],
  ): string | undefined {
    for (const key of keys) {
      const value = payload[key];

      if (typeof value === 'string') {
        const normalized = value.trim();

        if (normalized.length > 0) {
          return normalized;
        }
      }
    }

    return undefined;
  }

  private pickNumber(
    payload: Record<string, unknown>,
    keys: string[],
  ): number | undefined {
    for (const key of keys) {
      const value = payload[key];

      if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
      }

      if (typeof value === 'string' && /^\d+$/.test(value)) {
        return Number.parseInt(value, 10);
      }
    }

    return undefined;
  }

  private async safeFetch(input: URL | string, init: RequestInit): Promise<Response> {
    try {
      return await fetch(input, {
        ...init,
        signal: AbortSignal.timeout(OAUTH_FETCH_TIMEOUT_MS),
      });
    } catch (error) {
      this.logger.warn(`OAuth network call failed: ${(error as Error).message}`);
      throw new ServiceUnavailableException('OAuth provider is temporarily unavailable');
    }
  }

  private async readJsonObject(
    response: Response,
  ): Promise<Record<string, unknown>> {
    try {
      const payload: unknown = await response.json();

      if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
        return payload as Record<string, unknown>;
      }

      return {};
    } catch {
      return {};
    }
  }

  private toAuditPayload(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }
}
