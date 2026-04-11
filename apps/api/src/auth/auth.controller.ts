import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { OAuthProvider } from '@prisma/client';
import { Request, Response } from 'express';

import { RateLimit } from '../security/decorators/rate-limit.decorator';
import { AuthCookieService } from '../security/services/auth-cookie.service';

import { AuthService } from './auth.service';
import {
  AccessTokenPayload,
  AuthResponse,
  AuthSuccessResponse,
  LinkedOAuthAccount,
  MeResponse,
  OAuthAuthorizationStartResponse,
  providerByName,
  providerNameByEnum,
  RequestMeta,
} from './auth.types';
import { CurrentUser } from './decorators/current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { OAuthCallbackQueryDto } from './dto/oauth-callback-query.dto';
import { OAuthStartQueryDto } from './dto/oauth-start-query.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { VerifyLoginTwoFactorDto } from './dto/verify-login-two-factor.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly authCookieService: AuthCookieService,
  ) {}

  @Post('register')
  @RateLimit({ bucket: 'auth' })
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthSuccessResponse> {
    const result = await this.authService.register(dto, this.extractRequestMeta(req));
    return this.attachSessionCookies(response, result);
  }

  @Post('login')
  @RateLimit({ bucket: 'auth' })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    const result = await this.authService.login(dto, this.extractRequestMeta(req));
    if (result.status === 'authenticated') {
      return this.attachSessionCookies(response, result);
    }

    return result;
  }

  @Post('login/2fa/verify')
  @RateLimit({ bucket: 'auth' })
  async verifyLoginTwoFactor(
    @Body() dto: VerifyLoginTwoFactorDto,
    @Req() req: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthSuccessResponse> {
    const result = await this.authService.verifyLoginTwoFactor(
      dto,
      this.extractRequestMeta(req),
    );
    return this.attachSessionCookies(response, result);
  }

  @Post('refresh')
  @RateLimit({ bucket: 'refresh' })
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Req() req: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    const resolvedToken = this.authCookieService.resolveRefreshToken(req, dto.refreshToken);

    if (resolvedToken.source === 'cookie') {
      this.authCookieService.assertCsrf(req);
    }

    const result = await this.authService.refresh(
      { refreshToken: resolvedToken.token },
      this.extractRequestMeta(req),
    );

    return this.attachSessionCookies(response, result);
  }

  @Post('logout')
  @RateLimit({ bucket: 'refresh' })
  async logout(
    @Body() dto: RefreshTokenDto,
    @Req() req: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ success: true }> {
    const resolvedToken = this.authCookieService.resolveRefreshToken(req, dto.refreshToken);

    if (resolvedToken.source === 'cookie') {
      this.authCookieService.assertCsrf(req);
    }

    await this.authService.logout({
      refreshToken: resolvedToken.token,
    });
    this.authCookieService.clearAuthCookies(response);

    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout-all')
  @RateLimit({ bucket: 'refresh' })
  async logoutAll(
    @CurrentUser() user: AccessTokenPayload,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ success: true }> {
    await this.authService.logoutAll(user.sub);
    this.authCookieService.clearAuthCookies(response);

    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@CurrentUser() user: AccessTokenPayload): Promise<MeResponse> {
    return this.authService.me(user.sub);
  }

  @Get('oauth/:provider/start')
  @RateLimit({ bucket: 'oauth' })
  async oauthStart(
    @Param('provider') providerName: string,
    @Query() query: OAuthStartQueryDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<OAuthAuthorizationStartResponse> {
    const provider = this.resolveProvider(providerName);
    return await this.attachOAuthStateCookie(
      response,
      this.authService.getAuthorizationUrlForLogin(provider, query.state),
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('oauth/:provider/link/start')
  @RateLimit({ bucket: 'oauth' })
  async oauthLinkStart(
    @Param('provider') providerName: string,
    @Query() query: OAuthStartQueryDto,
    @CurrentUser() user: AccessTokenPayload,
    @Res({ passthrough: true }) response: Response,
  ): Promise<OAuthAuthorizationStartResponse> {
    const provider = this.resolveProvider(providerName);
    return await this.attachOAuthStateCookie(
      response,
      this.authService.getAuthorizationUrlForLink(provider, user.sub, query.state),
    );
  }

  @Get('oauth/:provider/callback')
  @RateLimit({ bucket: 'oauth' })
  async oauthCallback(
    @Param('provider') providerName: string,
    @Query() query: OAuthCallbackQueryDto,
    @Req() req: Request,
    @Res() response: Response,
  ): Promise<void> {
    const provider = this.resolveProvider(providerName);
    await this.completeOAuthCallback(provider, query, req, response);
  }

  @UseGuards(JwtAuthGuard)
  @Get('oauth/accounts')
  async linkedOAuthAccounts(
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<LinkedOAuthAccount[]> {
    return this.authService.listLinkedOAuthAccounts(user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('oauth/:provider')
  async unlinkOAuthProvider(
    @Param('provider') providerName: string,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<{ success: true }> {
    const provider = this.resolveProvider(providerName);
    await this.authService.unlinkOAuthAccount(user.sub, provider);

    return { success: true };
  }

  @Get('google')
  @RateLimit({ bucket: 'oauth' })
  async googleStart(
    @Query() query: OAuthStartQueryDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<OAuthAuthorizationStartResponse> {
    return await this.attachOAuthStateCookie(
      response,
      this.authService.getAuthorizationUrlForLogin(OAuthProvider.GOOGLE, query.state),
    );
  }

  @Get('vk')
  @RateLimit({ bucket: 'oauth' })
  async vkStart(
    @Query() query: OAuthStartQueryDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<OAuthAuthorizationStartResponse> {
    return await this.attachOAuthStateCookie(
      response,
      this.authService.getAuthorizationUrlForLogin(OAuthProvider.VK, query.state),
    );
  }

  @Get('yandex')
  @RateLimit({ bucket: 'oauth' })
  async yandexStart(
    @Query() query: OAuthStartQueryDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<OAuthAuthorizationStartResponse> {
    return await this.attachOAuthStateCookie(
      response,
      this.authService.getAuthorizationUrlForLogin(OAuthProvider.YANDEX, query.state),
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('google/link')
  @RateLimit({ bucket: 'oauth' })
  async googleLinkStart(
    @Query() query: OAuthStartQueryDto,
    @CurrentUser() user: AccessTokenPayload,
    @Res({ passthrough: true }) response: Response,
  ): Promise<OAuthAuthorizationStartResponse> {
    return await this.attachOAuthStateCookie(
      response,
      this.authService.getAuthorizationUrlForLink(
        OAuthProvider.GOOGLE,
        user.sub,
        query.state,
      ),
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('vk/link')
  @RateLimit({ bucket: 'oauth' })
  async vkLinkStart(
    @Query() query: OAuthStartQueryDto,
    @CurrentUser() user: AccessTokenPayload,
    @Res({ passthrough: true }) response: Response,
  ): Promise<OAuthAuthorizationStartResponse> {
    return await this.attachOAuthStateCookie(
      response,
      this.authService.getAuthorizationUrlForLink(OAuthProvider.VK, user.sub, query.state),
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('yandex/link')
  @RateLimit({ bucket: 'oauth' })
  async yandexLinkStart(
    @Query() query: OAuthStartQueryDto,
    @CurrentUser() user: AccessTokenPayload,
    @Res({ passthrough: true }) response: Response,
  ): Promise<OAuthAuthorizationStartResponse> {
    return await this.attachOAuthStateCookie(
      response,
      this.authService.getAuthorizationUrlForLink(
        OAuthProvider.YANDEX,
        user.sub,
        query.state,
      ),
    );
  }

  @Get('google/callback')
  @RateLimit({ bucket: 'oauth' })
  async googleCallback(
    @Query() query: OAuthCallbackQueryDto,
    @Req() req: Request,
    @Res() response: Response,
  ): Promise<void> {
    await this.completeOAuthCallback(OAuthProvider.GOOGLE, query, req, response);
  }

  @Get('vk/callback')
  @RateLimit({ bucket: 'oauth' })
  async vkCallback(
    @Query() query: OAuthCallbackQueryDto,
    @Req() req: Request,
    @Res() response: Response,
  ): Promise<void> {
    await this.completeOAuthCallback(OAuthProvider.VK, query, req, response);
  }

  @Get('yandex/callback')
  @RateLimit({ bucket: 'oauth' })
  async yandexCallback(
    @Query() query: OAuthCallbackQueryDto,
    @Req() req: Request,
    @Res() response: Response,
  ): Promise<void> {
    await this.completeOAuthCallback(OAuthProvider.YANDEX, query, req, response);
  }

  private async completeOAuthCallback(
    provider: OAuthProvider,
    query: OAuthCallbackQueryDto,
    req: Request,
    response: Response,
  ): Promise<void> {
    const resolvedState =
      provider === OAuthProvider.VK
        ? this.authCookieService.getOAuthState(req) ?? query.state ?? undefined
        : query.state;

    try {
      this.authCookieService.assertOAuthState(req, resolvedState);
      const result = await this.authService.handleOAuthCallback(
        provider,
        {
          ...query,
          state: resolvedState,
        },
        this.extractRequestMeta(req),
      );

      if (result.mode === 'login') {
        const payload = this.attachSessionCookies(response, result);
        const redirectUrl = this.buildOAuthRedirectUrl(result.clientState, {
          provider,
          mode: 'login',
          csrfToken: payload.csrfToken,
        });

        if (redirectUrl) {
          response.redirect(302, redirectUrl);
          return;
        }

        response.json(payload);
        return;
      }

      const redirectUrl = this.buildOAuthRedirectUrl(result.clientState, {
        provider,
        mode: 'link',
        linked: result.linked,
        alreadyLinked: result.alreadyLinked,
      });

      if (redirectUrl) {
        response.redirect(302, redirectUrl);
        return;
      }

      response.json(result);
    } finally {
      this.authCookieService.clearOAuthStateCookie(response);
    }
  }

  private resolveProvider(providerName: string): OAuthProvider {
    const key = providerName.trim().toLowerCase();
    const provider = providerByName[key];

    if (!provider) {
      throw new BadRequestException('Неподдерживаемый OAuth-провайдер');
    }

    return provider;
  }

  private extractRequestMeta(req: Request): RequestMeta {
    const forwarded = req.headers['x-forwarded-for'];
    const userAgentHeader = req.headers['user-agent'];

    const forwardedRaw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    const userAgent = Array.isArray(userAgentHeader)
      ? userAgentHeader[0]
      : userAgentHeader;

    return {
      ipAddress:
        (typeof forwardedRaw === 'string'
          ? forwardedRaw.split(',')[0]?.trim()
          : undefined) || req.ip,
      userAgent: typeof userAgent === 'string' ? userAgent : undefined,
    };
  }

  private attachSessionCookies<
    T extends AuthSuccessResponse | { tokens: { refreshToken?: string; refreshTokenExpiresAt?: string } },
  >(
    response: Response,
    payload: T,
  ): T & { csrfToken: string } {
    if (!payload.tokens.refreshToken || !payload.tokens.refreshTokenExpiresAt) {
      throw new BadRequestException('Отсутствует содержимое refresh-токена');
    }

    const csrfToken = this.authCookieService.setAuthCookies(
      response,
      payload.tokens.refreshToken,
      payload.tokens.refreshTokenExpiresAt,
    );

    return {
      ...payload,
      tokens: {
        ...payload.tokens,
        refreshToken: undefined,
      },
      csrfToken,
    } as T & { csrfToken: string };
  }

  private async attachOAuthStateCookie(
    response: Response,
    pending: Promise<OAuthAuthorizationStartResponse>,
  ): Promise<OAuthAuthorizationStartResponse> {
    const payload = await pending;
    this.authCookieService.setOAuthStateCookie(response, payload.state);
    return payload;
  }

  private buildOAuthRedirectUrl(
    clientState: string | null | undefined,
    params: {
      provider: OAuthProvider;
      mode: 'login' | 'link';
      csrfToken?: string;
      linked?: boolean;
      alreadyLinked?: boolean;
    },
  ): string | null {
    const path = clientState?.trim();

    if (!path || !path.startsWith('/')) {
      return null;
    }

    const guardOrigin = 'https://app.local';
    const redirectUrl = new URL(path, guardOrigin);

    if (redirectUrl.origin !== guardOrigin) {
      return null;
    }

    redirectUrl.searchParams.set('provider', providerNameByEnum[params.provider]);
    redirectUrl.searchParams.set('mode', params.mode);

    if (params.csrfToken) {
      redirectUrl.searchParams.set('csrfToken', params.csrfToken);
    }

    if (params.linked !== undefined) {
      redirectUrl.searchParams.set('linked', String(params.linked));
    }

    if (params.alreadyLinked !== undefined) {
      redirectUrl.searchParams.set('alreadyLinked', String(params.alreadyLinked));
    }

    return `${redirectUrl.pathname}${redirectUrl.search}${redirectUrl.hash}`;
  }
}
