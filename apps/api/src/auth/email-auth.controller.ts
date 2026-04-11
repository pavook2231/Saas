import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';

import { RateLimit } from '../security/decorators/rate-limit.decorator';
import { AuthCookieService } from '../security/services/auth-cookie.service';

import { AuthService } from './auth.service';
import { AuthSuccessResponse, EmailCodeRequestResponse, RequestMeta } from './auth.types';
import { LoginWithEmailCodeDto } from './dto/login-with-email-code.dto';
import { RegisterWithEmailCodeDto } from './dto/register-with-email-code.dto';
import { RequestEmailAuthCodeDto } from './dto/request-email-auth-code.dto';
import { ResetPasswordWithEmailCodeDto } from './dto/reset-password-with-email-code.dto';

@Controller('auth/email')
export class EmailAuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly authCookieService: AuthCookieService,
  ) {}

  @Post('login/request')
  @RateLimit({ bucket: 'auth' })
  async requestLoginCode(
    @Body() dto: RequestEmailAuthCodeDto,
  ): Promise<EmailCodeRequestResponse> {
    return this.authService.requestLoginEmailCode(dto);
  }

  @Post('login/verify')
  @RateLimit({ bucket: 'auth' })
  async loginWithCode(
    @Body() dto: LoginWithEmailCodeDto,
    @Req() req: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthSuccessResponse> {
    const result = await this.authService.loginWithEmailCode(
      dto,
      this.extractRequestMeta(req),
    );

    return this.attachSessionCookies(response, result);
  }

  @Post('register/request')
  @RateLimit({ bucket: 'auth' })
  async requestRegisterCode(
    @Body() dto: RequestEmailAuthCodeDto,
  ): Promise<EmailCodeRequestResponse> {
    return this.authService.requestRegisterEmailCode(dto);
  }

  @Post('register/verify')
  @RateLimit({ bucket: 'auth' })
  async registerWithCode(
    @Body() dto: RegisterWithEmailCodeDto,
    @Req() req: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthSuccessResponse> {
    const result = await this.authService.registerWithEmailCode(
      dto,
      this.extractRequestMeta(req),
    );

    return this.attachSessionCookies(response, result);
  }

  @Post('password/request')
  @RateLimit({ bucket: 'auth' })
  async requestPasswordResetCode(
    @Body() dto: RequestEmailAuthCodeDto,
  ): Promise<EmailCodeRequestResponse> {
    return this.authService.requestPasswordResetEmailCode(dto);
  }

  @Post('password/verify')
  @RateLimit({ bucket: 'auth' })
  async resetPasswordWithCode(
    @Body() dto: ResetPasswordWithEmailCodeDto,
    @Req() req: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthSuccessResponse> {
    const result = await this.authService.resetPasswordWithEmailCode(
      dto,
      this.extractRequestMeta(req),
    );

    return this.attachSessionCookies(response, result);
  }

  private extractRequestMeta(request: Request): RequestMeta {
    const forwardedFor = request.headers['x-forwarded-for'];
    const userAgent = request.headers['user-agent'];

    const ipAddress =
      typeof forwardedFor === 'string'
        ? forwardedFor.split(',')[0]?.trim()
        : request.ip;

    return {
      ipAddress: ipAddress || undefined,
      userAgent: typeof userAgent === 'string' ? userAgent : undefined,
    };
  }

  private attachSessionCookies<
    T extends {
      tokens: { refreshToken?: string; refreshTokenExpiresAt?: string };
    },
  >(
    response: Response,
    payload: T,
  ): T & { csrfToken: string } {
    if (!payload.tokens.refreshToken || !payload.tokens.refreshTokenExpiresAt) {
      throw new Error('Refresh token payload is missing.');
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
    };
  }
}
