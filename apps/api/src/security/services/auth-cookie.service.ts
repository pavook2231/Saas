import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { Request, Response } from 'express';

import { AppConfig } from '../../config/app.config';
import { DEFAULT_SECURITY_COOKIE_NAMES } from '../security.constants';

type RuntimeConfig = {
  appConfig: AppConfig;
};

type RefreshTokenSource = 'cookie';

@Injectable()
export class AuthCookieService {
  constructor(private readonly configService: ConfigService<RuntimeConfig>) {}

  setAuthCookies(
    response: Response,
    refreshToken: string,
    refreshTokenExpiresAt: string,
  ): string {
    const csrfToken = this.issueCsrfToken();
    const expiresAt = new Date(refreshTokenExpiresAt);

    response.cookie(
      this.getConfig().security.cookies.refreshTokenName,
      refreshToken,
      this.getRefreshCookieOptions(expiresAt),
    );
    response.cookie(
      this.getConfig().security.cookies.csrfTokenName,
      csrfToken,
      this.getCsrfCookieOptions(expiresAt, '/'),
    );
    response.cookie(
      this.getConfig().security.cookies.csrfTokenName,
      csrfToken,
      this.getCsrfCookieOptions(expiresAt, '/api/auth'),
    );
    return csrfToken;
  }

  clearAuthCookies(response: Response): void {
    response.clearCookie(
      this.getConfig().security.cookies.refreshTokenName,
      this.getRefreshCookieOptions(undefined),
    );
    response.clearCookie(
      this.getConfig().security.cookies.csrfTokenName,
      this.getCsrfCookieOptions(undefined, '/'),
    );
    response.clearCookie(
      this.getConfig().security.cookies.csrfTokenName,
      this.getCsrfCookieOptions(undefined, '/api/auth'),
    );
  }

  setOAuthStateCookie(response: Response, state: string): void {
    response.cookie(
      this.getConfig().security.cookies.oauthStateName,
      state,
      this.getOAuthStateCookieOptions(new Date(Date.now() + 10 * 60 * 1000)),
    );
  }

  getOAuthState(request: Request): string | null {
    return this.getCookie(
      request,
      this.getConfig().security.cookies.oauthStateName,
    );
  }

  assertOAuthState(request: Request, state?: string): void {
    const cookieState = this.getOAuthState(request);

    if (!state || !cookieState || cookieState !== state) {
      throw new UnauthorizedException('Проверка cookie-состояния OAuth не пройдена');
    }
  }

  clearOAuthStateCookie(response: Response): void {
    response.clearCookie(
      this.getConfig().security.cookies.oauthStateName,
      this.getOAuthStateCookieOptions(undefined),
    );
  }

  resolveRefreshToken(
    request: Request,
    bodyToken?: string | null,
  ): { token: string; source: RefreshTokenSource } {
    if (this.normalizeToken(bodyToken)) {
      throw new BadRequestException(
        'Передача refresh-токена в теле запроса отключена. Используйте cookie-сессию.',
      );
    }

    const cookieToken = this.getCookie(
      request,
      this.getConfig().security.cookies.refreshTokenName,
    );

    if (cookieToken) {
      return {
        token: cookieToken,
        source: 'cookie',
      };
    }

    throw new BadRequestException('Требуется refresh-токен');
  }

  assertCsrf(request: Request): void {
    const cookieToken = this.getCookie(
      request,
      this.getConfig().security.cookies.csrfTokenName,
    );
    const headerCandidate = request.headers['x-csrf-token'];
    const headerToken = Array.isArray(headerCandidate)
      ? headerCandidate[0]
      : headerCandidate;

    if (!cookieToken || typeof headerToken !== 'string' || headerToken !== cookieToken) {
      throw new UnauthorizedException('Проверка CSRF не пройдена');
    }

    const allowedOrigins = this.getConfig().app.corsOrigins;
    const originHeader = request.headers.origin;
    const refererHeader = request.headers.referer;
    const origin = Array.isArray(originHeader) ? originHeader[0] : originHeader;
    const referer = Array.isArray(refererHeader) ? refererHeader[0] : refererHeader;
    const requestOrigin = this.normalizeOrigin(origin) ?? this.normalizeOrigin(referer);

    if (!requestOrigin || !allowedOrigins.includes(requestOrigin)) {
      throw new UnauthorizedException('Источник запроса не разрешен');
    }
  }

  issueCsrfToken(): string {
    return randomBytes(32).toString('base64url');
  }

  private getRefreshCookieOptions(expires?: Date) {
    const config = this.getConfig();
    const base = {
      httpOnly: true,
      secure: config.security.cookies.secure,
      sameSite: config.security.cookies.sameSite,
      path: '/api/auth',
      expires,
    } as const;

    return config.security.cookies.domain
      ? {
          ...base,
          domain: config.security.cookies.domain,
        }
      : base;
  }

  private getCsrfCookieOptions(expires?: Date, path = '/') {
    const config = this.getConfig();
    const base = {
      httpOnly: false,
      secure: config.security.cookies.secure,
      sameSite: config.security.cookies.sameSite,
      path,
      expires,
    } as const;

    return config.security.cookies.domain
      ? {
          ...base,
          domain: config.security.cookies.domain,
        }
      : base;
  }

  private getOAuthStateCookieOptions(expires?: Date) {
    const config = this.getConfig();
    const base = {
      httpOnly: true,
      secure: config.security.cookies.secure,
      sameSite: config.security.cookies.sameSite,
      path: '/api/auth',
      expires,
    } as const;

    return config.security.cookies.domain
      ? {
          ...base,
          domain: config.security.cookies.domain,
        }
      : base;
  }

  private getCookie(request: Request, name: string): string | null {
    const header = request.headers.cookie;

    if (typeof header !== 'string' || header.trim().length === 0) {
      return null;
    }

    for (const pair of header.split(';')) {
      const [rawName, ...valueParts] = pair.trim().split('=');

      if (rawName !== name) {
        continue;
      }

      const value = valueParts.join('=').trim();

      if (value.length === 0) {
        return null;
      }

      try {
        return decodeURIComponent(value);
      } catch {
        return value;
      }
    }

    return null;
  }

  private normalizeToken(value?: string | null): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private normalizeOrigin(value?: string): string | null {
    if (!value) {
      return null;
    }

    try {
      return new URL(value).origin;
    } catch {
      return null;
    }
  }

  private getConfig(): AppConfig {
    const config = this.configService.get<AppConfig>('appConfig');

    if (!config) {
      throw new UnauthorizedException('Конфигурация приложения отсутствует');
    }

    return {
      ...config,
      security: {
        ...config.security,
        cookies: {
          refreshTokenName:
            config.security.cookies.refreshTokenName ??
            DEFAULT_SECURITY_COOKIE_NAMES.refreshToken,
          csrfTokenName:
            config.security.cookies.csrfTokenName ??
            DEFAULT_SECURITY_COOKIE_NAMES.csrfToken,
          oauthStateName:
            config.security.cookies.oauthStateName ??
            DEFAULT_SECURITY_COOKIE_NAMES.oauthState,
          sameSite: config.security.cookies.sameSite,
          secure: config.security.cookies.secure,
          domain: config.security.cookies.domain,
        },
      },
    };
  }
}
