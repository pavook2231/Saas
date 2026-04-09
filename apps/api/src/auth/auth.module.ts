import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import type { SignOptions } from 'jsonwebtoken';
import { PassportModule } from '@nestjs/passport';

import { PrismaModule } from '../prisma/prisma.module';
import { SecurityModule } from '../security/security.module';

import { AccountController } from './account.controller';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    SecurityModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const secret = configService.get<string>('appConfig.jwt.accessSecret');

        if (!secret) {
          throw new Error('JWT access secret is missing');
        }

        return {
          secret,
          signOptions: {
            expiresIn:
              (configService.get<string>('appConfig.jwt.accessExpiresIn') ?? '15m') as SignOptions['expiresIn'],
            issuer:
              configService.get<string>('appConfig.app.name') ??
              'saas-platform-api',
            audience: 'auth-access',
          },
        };
      },
    }),
  ],
  controllers: [AuthController, AccountController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
