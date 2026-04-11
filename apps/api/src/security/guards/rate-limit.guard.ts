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
    const limit = config.limit;
    const windowMs = config.windowMs;
    const identities = this.resolveIdentities(request, config.scope ?? 'user_or_ip');
    const routeKey = this.resolveRouteKey(request);
    const shouldPersistCounter =
      config.bucket === 'api' ||
      config.bucket === 'auth' ||
      config.bucket === 'refresh' ||
      config.bucket === 'oauth';

    if (shouldPersistCounter) {
      const counters = await Promise.all(
        identities.map((identity) =>
          this.consumePersistentCounter(`${routeKey}:${identity}`, windowMs),
        ),
      );
      const counter = this.selectStrictestCounter(counters);
      this.setHeaders(response, limit, counter.count, counter.resetAt);

      if (counter.count > limit) {
        response.setHeader(
          'Retry-After',
          Math.max(1, Math.ceil((counter.resetAt - now) / 1000)).toString(),
        );
        throw new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS);
      }

      return true;
    }

    const counters = identities.map((identity) => {
      const key = `${routeKey}:${identity}`;
      const current = this.counters.get(key);

      if (!current || current.resetAt <= now) {
        const nextCounter = {
          count: 1,
          resetAt: now + windowMs,
        };
        this.counters.set(key, nextCounter);
        return nextCounter;
      }

      current.count += 1;
      return current;
    });

    const counter = this.selectStrictestCounter(counters);
    this.setHeaders(response, limit, counter.count, counter.resetAt);
    this.cleanupExpired(now);

    if (counter.count > limit) {
      response.setHeader(
        'Retry-After',
        Math.max(1, Math.ceil((counter.resetAt - now) / 1000)).toString(),
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
            (override.bucket === 'refresh'
              ? 'user_or_ip'
              : override.bucket === 'auth'
                ? 'email_and_ip'
                : 'ip'),
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

  private resolveIdentities(
    request: Request & { user?: { sub?: string } },
    scope: RateLimitScope,
  ): string[] {
    const userId = request.user?.sub;

    if (scope === 'user_or_ip' && typeof userId === 'string' && userId.trim().length > 0) {
      return [`user:${userId}`];
    }

    if (scope === 'email_or_ip' || scope === 'email_and_ip') {
      const emailCandidate = (request.body as { email?: unknown } | undefined)?.email;

      if (typeof emailCandidate === 'string') {
        const normalizedEmail = emailCandidate.trim().toLowerCase();

        if (normalizedEmail.length > 0) {
          if (scope === 'email_and_ip') {
            return [`email:${normalizedEmail}`, `ip:${request.ip || 'unknown'}`];
          }

          return [`email:${normalizedEmail}`];
        }
      }
    }

    const ip = request.ip;

    return [`ip:${ip || 'unknown'}`];
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

  private selectStrictestCounter<T extends { count: number; resetAt: number }>(counters: T[]): T {
    return counters.reduce((strictest, candidate) => {
      if (candidate.count > strictest.count) {
        return candidate;
      }

      if (candidate.count === strictest.count && candidate.resetAt > strictest.resetAt) {
        return candidate;
      }

      return strictest;
    });
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
