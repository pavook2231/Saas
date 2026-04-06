import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { createHash } from 'crypto';
import { Request, Response } from 'express';

import { AppConfig } from '../../config/app.config';
import { PrismaService } from '../../prisma/prisma.service';
import {
  RATE_LIMIT_METADATA_KEY,
  RateLimitMetadata,
  RateLimitScope,
} from '../security.constants';

type RuntimeConfig = {
  appConfig: AppConfig;
};

type RateLimitCounter = {
  count: number;
  resetAt: number;
};

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly counters = new Map<string, RateLimitCounter>();
  private cleanupCountdown = 250;

  constructor(
    private readonly reflector: Reflector,
    private readonly configService: ConfigService<RuntimeConfig>,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType<'http'>() !== 'http') {
      return true;
    }

    const config = this.getRateLimitConfig(context);

    if (
      !config ||
      config.skip ||
      typeof config.limit !== 'number' ||
      typeof config.windowMs !== 'number' ||
      config.limit <= 0 ||
      config.windowMs <= 0
    ) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { user?: { sub?: string } }>();
    const response = context.switchToHttp().getResponse<Response>();
    const now = Date.now();
    const identity = this.resolveIdentity(request, config.scope ?? 'user_or_ip');
    const routeKey = this.resolveRouteKey(request);
    const key = `${routeKey}:${identity}`;

    const current = this.counters.get(key);
    const shouldPersistCounter =
      config.bucket === 'api' ||
      config.bucket === 'auth' ||
      config.bucket === 'refresh' ||
      config.bucket === 'oauth';

    if (shouldPersistCounter) {
      const counter = await this.consumePersistentCounter(key, config.windowMs);
      this.setHeaders(response, config.limit, counter.count, counter.resetAt);

      if (counter.count > config.limit) {
        response.setHeader(
          'Retry-After',
          Math.max(1, Math.ceil((counter.resetAt - now) / 1000)).toString(),
        );
        throw new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS);
      }

      return true;
    }

    if (!current || current.resetAt <= now) {
      this.counters.set(key, {
        count: 1,
        resetAt: now + config.windowMs,
      });
      this.setHeaders(response, config.limit, 1, now + config.windowMs);
      this.cleanupExpired(now);
      return true;
    }

    current.count += 1;
    this.setHeaders(response, config.limit, current.count, current.resetAt);
    this.cleanupExpired(now);

    if (current.count > config.limit) {
      response.setHeader(
        'Retry-After',
        Math.max(1, Math.ceil((current.resetAt - now) / 1000)).toString(),
      );
      throw new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS);
    }

    return true;
  }

  private getRateLimitConfig(context: ExecutionContext): RateLimitMetadata | null {
    const override = this.reflector.getAllAndOverride<RateLimitMetadata>(
      RATE_LIMIT_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (override) {
      if (override.bucket) {
        const config = this.getConfig();
        const bucket = config.security.rateLimit[override.bucket];
        return {
          limit: override.limit ?? bucket.limit,
          windowMs: override.windowMs ?? bucket.windowMs,
          bucket: override.bucket,
          scope:
            override.scope ??
            (override.bucket === 'refresh' ? 'user_or_ip' : 'ip'),
        };
      }

      return override;
    }

    const config = this.getConfig();

    return {
      bucket: 'api',
      limit: config.security.rateLimit.api.limit,
      windowMs: config.security.rateLimit.api.windowMs,
      scope: 'user_or_ip',
    };
  }

  private resolveIdentity(
    request: Request & { user?: { sub?: string } },
    scope: RateLimitScope,
  ): string {
    const userId = request.user?.sub;

    if (scope === 'user_or_ip' && typeof userId === 'string' && userId.trim().length > 0) {
      return `user:${userId}`;
    }

    const forwarded = request.headers['x-forwarded-for'];
    const forwardedValue = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    const ip =
      (typeof forwardedValue === 'string'
        ? forwardedValue.split(',')[0]?.trim()
        : undefined) ?? request.ip;

    return `ip:${ip || 'unknown'}`;
  }

  private resolveRouteKey(request: Request): string {
    const baseUrl = request.baseUrl ?? '';
    const routePath = request.route?.path ?? request.path ?? request.originalUrl ?? 'unknown';
    return `${request.method.toUpperCase()}:${baseUrl}${routePath}`;
  }

  private setHeaders(
    response: Response,
    limit: number,
    count: number,
    resetAt: number,
  ): void {
    response.setHeader('X-RateLimit-Limit', limit.toString());
    response.setHeader('X-RateLimit-Remaining', Math.max(0, limit - count).toString());
    response.setHeader('X-RateLimit-Reset', Math.ceil(resetAt / 1000).toString());
  }

  private cleanupExpired(now: number): void {
    this.cleanupCountdown -= 1;

    if (this.cleanupCountdown > 0) {
      return;
    }

    this.cleanupCountdown = 250;

    for (const [key, counter] of this.counters.entries()) {
      if (counter.resetAt <= now) {
        this.counters.delete(key);
      }
    }
  }

  private getConfig(): AppConfig {
    const config = this.configService.get<AppConfig>('appConfig');

    if (!config) {
      throw new HttpException(
        'Rate limit configuration is unavailable',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    return config;
  }

  private async consumePersistentCounter(
    key: string,
    windowMs: number,
  ): Promise<{ count: number; resetAt: number }> {
    const now = new Date();
    const persistedKey = createHash('sha256').update(key).digest('hex');

    const counter = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.securityRateLimit.findUnique({
        where: {
          key: persistedKey,
        },
        select: {
          key: true,
          hits: true,
          resetAt: true,
        },
      });

      if (!existing || existing.resetAt.getTime() <= now.getTime()) {
        const created = await tx.securityRateLimit.upsert({
          where: {
            key: persistedKey,
          },
          update: {
            hits: 1,
            resetAt: new Date(now.getTime() + windowMs),
          },
          create: {
            key: persistedKey,
            hits: 1,
            resetAt: new Date(now.getTime() + windowMs),
          },
          select: {
            hits: true,
            resetAt: true,
          },
        });

        return created;
      }

      const updated = await tx.securityRateLimit.update({
        where: {
          key: persistedKey,
        },
        data: {
          hits: {
            increment: 1,
          },
        },
        select: {
          hits: true,
          resetAt: true,
        },
      });

      return updated;
    });

    return {
      count: counter.hits,
      resetAt: counter.resetAt.getTime(),
    };
  }
}
