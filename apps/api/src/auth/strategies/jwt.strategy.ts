import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { AccessTokenPayload } from '../auth.types';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const appName =
      configService.get<string>('appConfig.app.name') ?? 'saas-platform-api';

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('appConfig.jwt.accessSecret'),
      issuer: appName,
      audience: 'auth-access',
    });
  }

  async validate(payload: AccessTokenPayload): Promise<AccessTokenPayload> {
    if (
      payload.type !== 'access' ||
      typeof payload.sub !== 'string' ||
      payload.sub.trim().length === 0 ||
      typeof payload.email !== 'string' ||
      payload.email.trim().length === 0
    ) {
      throw new UnauthorizedException('Неверный тип access-токена');
    }

    const user = await this.prisma.user.findUnique({
      where: {
        id: payload.sub,
      },
      select: {
        id: true,
        isActive: true,
        deletedAt: true,
      },
    });

    if (!user || !user.isActive || user.deletedAt !== null) {
      throw new UnauthorizedException('Пользователь деактивирован');
    }

    return payload;
  }
}
