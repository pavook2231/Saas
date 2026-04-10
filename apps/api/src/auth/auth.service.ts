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
  EmailAuthCodePurpose,
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
import { createHash, randomBytes, randomInt, randomUUID } from 'crypto';
import type { SignOptions } from 'jsonwebtoken';

import { AppConfig, OAuthProviderRuntimeConfig } from '../config/app.config';
import { PrismaService } from '../prisma/prisma.service';

import { OAuthCallbackQueryDto } from './dto/oauth-callback-query.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { LoginWithEmailCodeDto } from './dto/login-with-email-code.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { RegisterWithEmailCodeDto } from './dto/register-with-email-code.dto';
import { RequestEmailAuthCodeDto } from './dto/request-email-auth-code.dto';
import { ResetPasswordWithEmailCodeDto } from './dto/reset-password-with-email-code.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { AuthEmailService } from './auth-email.service';
import { mapOAuthProfile, OAUTH_PROVIDER_DEFINITIONS } from './oauth.providers';
import {
  AccessTokenPayload,
  AuthResponse,
  EmailCodeRequestResponse,
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
const EMAIL_AUTH_CODE_EXPIRES_MINUTES = 10;
const EMAIL_AUTH_CODE_LENGTH = 6;
const EMAIL_AUTH_CODE_MAX_ATTEMPTS = 5;
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
    private readonly authEmailService: AuthEmailService,
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
        throw new ConflictException('РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ СЃ С‚Р°РєРёРј email СѓР¶Рµ СЃСѓС‰РµСЃС‚РІСѓРµС‚');
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
    if (dto.organizationJoinCode?.trim()) {
      throw new ForbiddenException(
        'Свободный вход в организацию отключен. Используйте приглашение администратора.',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: {
        id: initialUser.id,
      },
      select: publicUserSelect,
    });

    if (!user) {
      throw new UnauthorizedException('РЈС‡РµС‚РЅР°СЏ Р·Р°РїРёСЃСЊ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ РЅРµРґРѕСЃС‚СѓРїРЅР°');
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
      throw new UnauthorizedException('РќРµРІРµСЂРЅС‹Рµ СѓС‡РµС‚РЅС‹Рµ РґР°РЅРЅС‹Рµ');
    }

    this.assertUserEnabled(user);

    const isValidPassword = await compare(dto.password, user.passwordHash);

    if (!isValidPassword) {
      throw new UnauthorizedException('РќРµРІРµСЂРЅС‹Рµ СѓС‡РµС‚РЅС‹Рµ РґР°РЅРЅС‹Рµ');
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
      throw new BadRequestException('РўСЂРµР±СѓРµС‚СЃСЏ refresh-С‚РѕРєРµРЅ');
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
      throw new UnauthorizedException('РЈС‡РµС‚РЅР°СЏ Р·Р°РїРёСЃСЊ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ РЅРµРґРѕСЃС‚СѓРїРЅР°');
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
      throw new UnauthorizedException('РЈС‡РµС‚РЅР°СЏ Р·Р°РїРёСЃСЊ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ РЅРµРґРѕСЃС‚СѓРїРЅР°');
    }

    this.assertUserEnabled(user);

    const memberships = await this.getMembershipClaims(user.id);

    return {
      user: this.toPublicUser(user, memberships),
    };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<MeResponse> {
    const user = await this.getEnabledUserOrThrow(userId);

    const firstName =
      dto.firstName !== undefined ? this.trimOrNull(dto.firstName) : undefined;
    const lastName =
      dto.lastName !== undefined ? this.trimOrNull(dto.lastName) : undefined;
    const avatarUrl =
      dto.avatarUrl !== undefined ? this.trimOrNull(dto.avatarUrl) : undefined;

    if (firstName !== undefined && firstName !== null && firstName.length > 80) {
      throw new BadRequestException('Имя не должно быть длиннее 80 символов');
    }

    if (lastName !== undefined && lastName !== null && lastName.length > 80) {
      throw new BadRequestException('Фамилия не должна быть длиннее 80 символов');
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        firstName,
        lastName,
        avatarUrl,
      },
      select: publicUserSelect,
    });

    const memberships = await this.getMembershipClaims(updatedUser.id);

    await this.prisma.auditLog.create({
      data: {
        actorUserId: updatedUser.id,
        targetType: AuditTargetType.AUTH,
        targetId: updatedUser.id,
        action: 'auth.profile.updated',
        severity: AuditSeverity.INFO,
        payload: this.toAuditPayload({
          firstName: updatedUser.firstName,
          lastName: updatedUser.lastName,
          avatarUrl: updatedUser.avatarUrl,
        }),
      },
    });

    return {
      user: this.toPublicUser(updatedUser, memberships),
    };
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: userWithPasswordSelect,
    });

    if (!user) {
      throw new UnauthorizedException('Учетная запись пользователя недоступна');
    }

    this.assertUserEnabled(user);
    this.validatePasswordStrength(dto.newPassword);

    if (user.passwordHash) {
      if (!dto.currentPassword?.trim()) {
        throw new BadRequestException('Введите текущий пароль');
      }

      const matches = await compare(dto.currentPassword, user.passwordHash);

      if (!matches) {
        throw new UnauthorizedException('Текущий пароль указан неверно');
      }
    }

    const nextPasswordHash = await hash(dto.newPassword, 12);

    const revokedAt = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash: nextPasswordHash,
        },
      });

      await tx.refreshToken.updateMany({
        where: {
          userId: user.id,
          revokedAt: null,
        },
        data: {
          revokedAt,
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          targetType: AuditTargetType.AUTH,
          targetId: user.id,
          action: 'auth.password.changed',
          severity: AuditSeverity.INFO,
        },
      });
    });
  }

  async requestLoginEmailCode(
    dto: RequestEmailAuthCodeDto,
  ): Promise<EmailCodeRequestResponse> {
    const email = this.normalizeEmail(dto.email);

    const user = await this.prisma.user.findUnique({
      where: { email },
      select: publicUserSelect,
    });

    if (user) {
      this.assertUserEnabled(user);
      await this.issueEmailAuthCode(email, EmailAuthCodePurpose.LOGIN, user.id);
    }

    return this.toEmailCodeRequestResponse(email);
  }

  async loginWithEmailCode(
    dto: LoginWithEmailCodeDto,
    requestMeta: RequestMeta,
  ): Promise<AuthResponse> {
    const email = this.normalizeEmail(dto.email);
    await this.consumeEmailAuthCode(email, EmailAuthCodePurpose.LOGIN, dto.code);

    const user = await this.prisma.user.findUnique({
      where: { email },
      select: publicUserSelect,
    });

    if (!user) {
      throw new UnauthorizedException('Код недействителен или срок его действия истек.');
    }

    this.assertUserEnabled(user);

    const verifiedUser = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        isEmailVerified: true,
        lastLoginAt: new Date(),
      },
      select: publicUserSelect,
    });

    await this.syncParticipantsForUser(verifiedUser.id, verifiedUser.email);

    const memberships = await this.getMembershipClaims(verifiedUser.id);
    const tokens = await this.createTokenPair(verifiedUser, memberships, requestMeta);

    return {
      user: this.toPublicUser(verifiedUser, memberships),
      tokens,
    };
  }

  async requestRegisterEmailCode(
    dto: RequestEmailAuthCodeDto,
  ): Promise<EmailCodeRequestResponse> {
    const email = this.normalizeEmail(dto.email);

    const existingUser = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        isEmailVerified: true,
        isActive: true,
        deletedAt: true,
      },
    });

    if (
      existingUser?.isEmailVerified &&
      existingUser.deletedAt === null &&
      existingUser.isActive
    ) {
      return this.toEmailCodeRequestResponse(email);
    }

    await this.issueEmailAuthCode(email, EmailAuthCodePurpose.REGISTER, existingUser?.id ?? null);
    return this.toEmailCodeRequestResponse(email);
  }

  async registerWithEmailCode(
    dto: RegisterWithEmailCodeDto,
    requestMeta: RequestMeta,
  ): Promise<AuthResponse> {
    const email = this.normalizeEmail(dto.email);
    this.validatePasswordStrength(dto.password);
    await this.consumeEmailAuthCode(email, EmailAuthCodePurpose.REGISTER, dto.code);

    const existingUser = await this.prisma.user.findUnique({
      where: { email },
      select: userWithPasswordSelect,
    });

    if (existingUser?.isEmailVerified && existingUser.deletedAt === null && existingUser.isActive) {
      throw new ConflictException('Аккаунт с таким email уже существует.');
    }

    const passwordHash = await hash(dto.password, 12);
    const now = new Date();

    const user = existingUser
      ? await this.prisma.user.update({
          where: { id: existingUser.id },
          data: {
            passwordHash,
            isEmailVerified: true,
            isActive: true,
            deletedAt: null,
            firstName: this.trimOrNull(dto.firstName) ?? existingUser.firstName,
            lastName: this.trimOrNull(dto.lastName) ?? existingUser.lastName,
            lastLoginAt: now,
          },
          select: publicUserSelect,
        })
      : await this.prisma.user.create({
          data: {
            email,
            passwordHash,
            isEmailVerified: true,
            firstName: this.trimOrNull(dto.firstName),
            lastName: this.trimOrNull(dto.lastName),
            lastLoginAt: now,
          },
          select: publicUserSelect,
        });

    this.assertUserEnabled(user);
    await this.claimInviteTokensForUser(user.id, email, {
      email,
      password: dto.password,
      firstName: dto.firstName,
      lastName: dto.lastName,
      organizationInviteToken: dto.organizationInviteToken,
      participantInviteToken: dto.participantInviteToken,
    });
    await this.syncParticipantsForUser(user.id, user.email);

    const memberships = await this.getMembershipClaims(user.id);
    const tokens = await this.createTokenPair(user, memberships, requestMeta);

    return {
      user: this.toPublicUser(user, memberships),
      tokens,
    };
  }

  async requestPasswordResetEmailCode(
    dto: RequestEmailAuthCodeDto,
  ): Promise<EmailCodeRequestResponse> {
    const email = this.normalizeEmail(dto.email);

    const user = await this.prisma.user.findUnique({
      where: { email },
      select: publicUserSelect,
    });

    if (user) {
      this.assertUserEnabled(user);
      await this.issueEmailAuthCode(email, EmailAuthCodePurpose.PASSWORD_RESET, user.id);
    }

    return this.toEmailCodeRequestResponse(email);
  }

  async resetPasswordWithEmailCode(
    dto: ResetPasswordWithEmailCodeDto,
    requestMeta: RequestMeta,
  ): Promise<AuthResponse> {
    const email = this.normalizeEmail(dto.email);
    this.validatePasswordStrength(dto.newPassword);
    await this.consumeEmailAuthCode(email, EmailAuthCodePurpose.PASSWORD_RESET, dto.code);

    const user = await this.prisma.user.findUnique({
      where: { email },
      select: userWithPasswordSelect,
    });

    if (!user) {
      throw new UnauthorizedException('Код недействителен или срок его действия истек.');
    }

    this.assertUserEnabled(user);

    const nextPasswordHash = await hash(dto.newPassword, 12);
    const revokedAt = new Date();

    const updatedUser = await this.prisma.$transaction(async (tx) => {
      const nextUser = await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash: nextPasswordHash,
          isEmailVerified: true,
          lastLoginAt: revokedAt,
        },
        select: publicUserSelect,
      });

      await tx.refreshToken.updateMany({
        where: {
          userId: user.id,
          revokedAt: null,
        },
        data: {
          revokedAt,
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          targetType: AuditTargetType.AUTH,
          targetId: user.id,
          action: 'auth.password.reset-by-email-code',
          severity: AuditSeverity.INFO,
        },
      });

      return nextUser;
    });

    await this.syncParticipantsForUser(updatedUser.id, updatedUser.email);

    const memberships = await this.getMembershipClaims(updatedUser.id);
    const tokens = await this.createTokenPair(updatedUser, memberships, requestMeta);

    return {
      user: this.toPublicUser(updatedUser, memberships),
      tokens,
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

    if (
      !providerConfig.clientId ||
      (provider !== OAuthProvider.VK && !providerConfig.clientSecret)
    ) {
      throw new ServiceUnavailableException(
        `OAuth ${providerNameByEnum[provider]} credentials are missing`,
      );
    }

    const tokenResult = await this.exchangeCodeForToken(
      provider,
      normalizedCode,
      providerConfig,
      {
        state: query.state,
        deviceId: query.device_id,
        codeVerifier: statePayload.codeVerifier,
      },
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
        throw new UnauthorizedException('OAuth link state is invalid');
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
      throw new UnauthorizedException('РЈС‡РµС‚РЅР°СЏ Р·Р°РїРёСЃСЊ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ РЅРµРґРѕСЃС‚СѓРїРЅР°');
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
        `РЎРІСЏР·Р°РЅРЅС‹Р№ Р°РєРєР°СѓРЅС‚ ${providerNameByEnum[provider]} РЅРµ РЅР°Р№РґРµРЅ`,
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
        'РќРµР»СЊР·СЏ РѕС‚РІСЏР·Р°С‚СЊ РїРѕСЃР»РµРґРЅРёР№ Р°РєС‚РёРІРЅС‹Р№ СЃРїРѕСЃРѕР± РІС…РѕРґР° Р±РµР· РїР°СЂРѕР»СЏ',
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
    const normalizedClientState = this.normalizeClientState(clientState) ?? undefined;

    const statePayload: OAuthStatePayload = {
      type: 'oauth_state',
      provider,
      action,
      clientState: normalizedClientState,
      linkUserId: action === 'link' ? linkUserId : undefined,
      codeVerifier:
        provider === OAuthProvider.VK ? this.generatePkceCodeVerifier() : undefined,
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
      secret: this.getConfig().jwt.oauthStateSecret,
      expiresIn: OAUTH_STATE_EXPIRES_IN,
      issuer: this.getConfig().app.name,
      audience: 'oauth-state',
      ...(action === 'link' && linkUserId ? { subject: linkUserId } : {}),
    });

    const queryParams = new URLSearchParams({
      response_type: 'code',
      client_id: providerConfig.clientId,
      redirect_uri: providerConfig.callbackUrl,
    });

    queryParams.set('state', signedState);

    if (provider === OAuthProvider.VK) {
      if (!statePayload.codeVerifier) {
        throw new ServiceUnavailableException('OAuth vk code verifier is missing');
      }

      queryParams.set('app_id', providerConfig.clientId);
      queryParams.set('sdk_type', 'vkid');
      queryParams.set('v', '2.6.5');
      queryParams.set(
        'code_challenge',
        this.generatePkceCodeChallenge(statePayload.codeVerifier),
      );
      queryParams.set('code_challenge_method', 's256');
    }

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
      throw new BadRequestException('Требуется OAuth state');
    }

    try {
      const payload = this.jwtService.verify<OAuthStatePayload>(state, {
        secret: this.getConfig().jwt.oauthStateSecret,
        issuer: this.getConfig().app.name,
        audience: 'oauth-state',
      });

      if (
        payload.type !== 'oauth_state' ||
        payload.provider !== provider ||
        (payload.action !== 'login' && payload.action !== 'link')
      ) {
        throw new UnauthorizedException('OAuth state is invalid');
      }

      if (payload.action === 'link' && !payload.linkUserId) {
        throw new UnauthorizedException('OAuth link state is invalid');
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
        throw new UnauthorizedException('OAuth state is invalid');
      }

      return payload;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      throw new UnauthorizedException('OAuth state is invalid');
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
          throw new UnauthorizedException('РЈС‡РµС‚РЅР°СЏ Р·Р°РїРёСЃСЊ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ РѕС‚РєР»СЋС‡РµРЅР°');
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
        throw new UnauthorizedException('Р¦РµР»РµРІРѕР№ РїРѕР»СЊР·РѕРІР°С‚РµР»СЊ РЅРµРґРѕСЃС‚СѓРїРµРЅ РґР»СЏ РїСЂРёРІСЏР·РєРё');
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
            `Р­С‚РѕС‚ Р°РєРєР°СѓРЅС‚ ${providerNameByEnum[provider]} СѓР¶Рµ РїСЂРёРІСЏР·Р°РЅ Рє РґСЂСѓРіРѕРјСѓ РїРѕР»СЊР·РѕРІР°С‚РµР»СЋ`,
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
            `РЈ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ СѓР¶Рµ РїСЂРёРІСЏР·Р°РЅ РґСЂСѓРіРѕР№ Р°РєРєР°СѓРЅС‚ ${providerNameByEnum[provider]}`,
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
    options?: {
      state?: string;
      deviceId?: string;
      codeVerifier?: string;
    },
  ): Promise<OAuthTokenExchangeResult> {
    const definition = OAUTH_PROVIDER_DEFINITIONS[provider];

    let response: Response;

    if (provider === OAuthProvider.VK) {
      if (!options?.state || !options.deviceId || !options.codeVerifier) {
        throw new UnauthorizedException('OAuth vk callback is incomplete');
      }

      const url = new URL(definition.tokenUrl);
      url.searchParams.set('grant_type', 'authorization_code');
      url.searchParams.set('redirect_uri', providerConfig.callbackUrl);
      url.searchParams.set('client_id', providerConfig.clientId);
      url.searchParams.set('code_verifier', options.codeVerifier);
      url.searchParams.set('state', options.state);
      url.searchParams.set('device_id', options.deviceId);

      response = await this.safeFetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          code,
        }),
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
        `РќРµ СѓРґР°Р»РѕСЃСЊ РѕР±РјРµРЅСЏС‚СЊ С‚РѕРєРµРЅ OAuth ${providerNameByEnum[provider]}`,
      );
    }

    const accessToken = this.pickString(payload, ['access_token']);

    if (!accessToken) {
      throw new UnauthorizedException('РћС‚СЃСѓС‚СЃС‚РІСѓРµС‚ access token OAuth');
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
      url.searchParams.set('client_id', _providerConfig.clientId);

      response = await this.safeFetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          access_token: accessToken,
        }),
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
        `РќРµ СѓРґР°Р»РѕСЃСЊ РїРѕР»СѓС‡РёС‚СЊ РїСЂРѕС„РёР»СЊ OAuth ${providerNameByEnum[provider]}`,
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
      throw new UnauthorizedException('Refresh-СЃРµСЃСЃРёСЏ РЅРµ СЃСѓС‰РµСЃС‚РІСѓРµС‚');
    }

    if (tokenRecord.userId !== payload.sub) {
      throw new UnauthorizedException('РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ refresh-СЃРµСЃСЃРёРё РЅРµ СЃРѕРІРїР°РґР°РµС‚');
    }

    if (tokenRecord.revokedAt) {
      throw new UnauthorizedException('Refresh-СЃРµСЃСЃРёСЏ РѕС‚РѕР·РІР°РЅР°');
    }

    if (tokenRecord.expiresAt <= new Date()) {
      throw new UnauthorizedException('РЎСЂРѕРє РґРµР№СЃС‚РІРёСЏ refresh-СЃРµСЃСЃРёРё РёСЃС‚РµРє');
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

      throw new UnauthorizedException('РћР±РЅР°СЂСѓР¶РµРЅРѕ РїРѕРІС‚РѕСЂРЅРѕРµ РёСЃРїРѕР»СЊР·РѕРІР°РЅРёРµ refresh-С‚РѕРєРµРЅР°');
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
        throw new UnauthorizedException('РќРµРєРѕСЂСЂРµРєС‚РЅРѕРµ СЃРѕРґРµСЂР¶РёРјРѕРµ refresh-С‚РѕРєРµРЅР°');
      }

      return payload;
    } catch {
      throw new UnauthorizedException('РќРµРґРµР№СЃС‚РІРёС‚РµР»СЊРЅС‹Р№ refresh-С‚РѕРєРµРЅ');
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
      expiresIn: config.jwt.accessExpiresIn as SignOptions['expiresIn'],
      issuer: config.app.name,
      audience: 'auth-access',
    });

    const refreshToken = await this.jwtService.signAsync(refreshPayload, {
      secret: config.jwt.refreshSecret,
      expiresIn: config.jwt.refreshExpiresIn as SignOptions['expiresIn'],
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
      throw new UnauthorizedException('РЈС‡РµС‚РЅР°СЏ Р·Р°РїРёСЃСЊ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ РЅРµРґРѕСЃС‚СѓРїРЅР°');
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
      throw new UnauthorizedException('РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РґРµР°РєС‚РёРІРёСЂРѕРІР°РЅ');
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
      throw new UnauthorizedException('РўРѕРєРµРЅ РїСЂРёРіР»Р°С€РµРЅРёСЏ РІ РѕСЂРіР°РЅРёР·Р°С†РёСЋ РЅРµРґРµР№СЃС‚РІРёС‚РµР»РµРЅ');
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
      throw new UnauthorizedException('РўРѕРєРµРЅ РїСЂРёРіР»Р°С€РµРЅРёСЏ СѓС‡Р°СЃС‚РЅРёРєР° РЅРµРґРµР№СЃС‚РІРёС‚РµР»РµРЅ');
    }

    if (invite.participant.userId && invite.participant.userId !== userId) {
      throw new ConflictException('РЈС‡Р°СЃС‚РЅРёРє СѓР¶Рµ СЃРІСЏР·Р°РЅ СЃ РґСЂСѓРіРёРј РїРѕР»СЊР·РѕРІР°С‚РµР»РµРј');
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

  private async issueEmailAuthCode(
    email: string,
    purpose: EmailAuthCodePurpose,
    userId?: string | null,
  ): Promise<void> {
    const normalizedEmail = this.normalizeEmail(email);
    const now = new Date();
    const code = this.generateEmailAuthCode();
    const expiresAt = new Date(now.getTime() + EMAIL_AUTH_CODE_EXPIRES_MINUTES * 60 * 1000);

    await this.prisma.$transaction(async (tx) => {
      await tx.emailAuthCode.updateMany({
        where: {
          email: normalizedEmail,
          purpose,
          consumedAt: null,
        },
        data: {
          consumedAt: now,
        },
      });

      await tx.emailAuthCode.create({
        data: {
          email: normalizedEmail,
          userId: userId ?? null,
          purpose,
          codeHash: this.hashEmailAuthCode(normalizedEmail, purpose, code),
          expiresAt,
        },
      });
    });

    await this.authEmailService.sendEmailCode({
      email: normalizedEmail,
      code,
      purpose,
      expiresInMinutes: EMAIL_AUTH_CODE_EXPIRES_MINUTES,
    });
  }

  private async consumeEmailAuthCode(
    email: string,
    purpose: EmailAuthCodePurpose,
    code: string,
  ): Promise<void> {
    const normalizedEmail = this.normalizeEmail(email);
    const normalizedCode = code.trim();

    if (!normalizedCode) {
      throw new BadRequestException('Введите код из письма.');
    }

    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.emailAuthCode.updateMany({
        where: {
          email: normalizedEmail,
          purpose,
          consumedAt: null,
          expiresAt: {
            lte: now,
          },
        },
        data: {
          consumedAt: now,
        },
      });

      const record = await tx.emailAuthCode.findFirst({
        where: {
          email: normalizedEmail,
          purpose,
          consumedAt: null,
          expiresAt: {
            gt: now,
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      if (!record) {
        throw new UnauthorizedException('Код недействителен или срок его действия истек.');
      }

      if (record.attempts >= EMAIL_AUTH_CODE_MAX_ATTEMPTS) {
        await tx.emailAuthCode.update({
          where: { id: record.id },
          data: {
            consumedAt: now,
            lastAttemptAt: now,
          },
        });

        throw new UnauthorizedException('Код недействителен или срок его действия истек.');
      }

      const expectedHash = this.hashEmailAuthCode(normalizedEmail, purpose, normalizedCode);

      if (record.codeHash !== expectedHash) {
        const nextAttempts = record.attempts + 1;

        await tx.emailAuthCode.update({
          where: { id: record.id },
          data: {
            attempts: nextAttempts,
            lastAttemptAt: now,
            consumedAt: nextAttempts >= EMAIL_AUTH_CODE_MAX_ATTEMPTS ? now : undefined,
          },
        });

        throw new UnauthorizedException('Код недействителен или срок его действия истек.');
      }

      await tx.emailAuthCode.update({
        where: { id: record.id },
        data: {
          consumedAt: now,
          lastAttemptAt: now,
        },
      });
    });
  }

  private validatePasswordStrength(password: string): void {
    const normalized = password.trim();

    if (!/[a-z]/.test(normalized) || !/[A-Z]/.test(normalized) || !/\d/.test(normalized)) {
      throw new BadRequestException(
        'РџР°СЂРѕР»СЊ РґРѕР»Р¶РµРЅ СЃРѕРґРµСЂР¶Р°С‚СЊ Р·Р°РіР»Р°РІРЅС‹Рµ Рё СЃС‚СЂРѕС‡РЅС‹Рµ Р±СѓРєРІС‹, Р° С‚Р°РєР¶Рµ С†РёС„СЂС‹',
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

  private normalizeClientState(value?: string | null): string | null {
    const normalized = this.trimOrNull(value);

    if (!normalized || !normalized.startsWith('/')) {
      return null;
    }

    try {
      const guardOrigin = 'https://app.local';
      const url = new URL(normalized, guardOrigin);

      if (url.origin !== guardOrigin) {
        return null;
      }

      return `${url.pathname}${url.search}${url.hash}`;
    } catch {
      return null;
    }
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private hashEmailAuthCode(
    email: string,
    purpose: EmailAuthCodePurpose,
    code: string,
  ): string {
    return createHash('sha256')
      .update(`email-auth-code:${email}:${purpose}:${code}`)
      .digest('hex');
  }

  private generateEmailAuthCode(): string {
    return randomInt(0, 10 ** EMAIL_AUTH_CODE_LENGTH)
      .toString()
      .padStart(EMAIL_AUTH_CODE_LENGTH, '0');
  }

  private generatePkceCodeVerifier(): string {
    return randomBytes(48).toString('base64url');
  }

  private generatePkceCodeChallenge(codeVerifier: string): string {
    return createHash('sha256')
      .update(codeVerifier)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  }

  private toEmailCodeRequestResponse(email: string): EmailCodeRequestResponse {
    return {
      success: true,
      maskedEmail: this.maskEmail(email),
      expiresInSeconds: EMAIL_AUTH_CODE_EXPIRES_MINUTES * 60,
    };
  }

  private maskEmail(email: string): string {
    const normalized = this.normalizeEmail(email);
    const [localPart, domainPart = ''] = normalized.split('@');
    const [domainName, ...domainTail] = domainPart.split('.');

    const maskChunk = (value: string, visible = 2): string => {
      if (value.length <= visible) {
        return value;
      }

      return `${value.slice(0, visible)}${'*'.repeat(Math.max(2, value.length - visible))}`;
    };

    const maskedDomainTail = domainTail.join('.');
    return `${maskChunk(localPart)}@${maskChunk(domainName)}${maskedDomainTail ? `.${maskedDomainTail}` : ''}`;
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
      throw new InternalServerErrorException('РљРѕРЅС„РёРіСѓСЂР°С†РёСЏ РїСЂРёР»РѕР¶РµРЅРёСЏ РѕС‚СЃСѓС‚СЃС‚РІСѓРµС‚');
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

