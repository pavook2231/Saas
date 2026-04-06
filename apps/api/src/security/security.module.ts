import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';

import { PrismaModule } from '../prisma/prisma.module';

import { RateLimitGuard } from './guards/rate-limit.guard';
import { AuthCookieService } from './services/auth-cookie.service';
import { DataEncryptionService } from './services/data-encryption.service';

@Module({
  imports: [ConfigModule, PrismaModule],
  providers: [
    DataEncryptionService,
    AuthCookieService,
    {
      provide: APP_GUARD,
      useClass: RateLimitGuard,
    },
  ],
  exports: [DataEncryptionService, AuthCookieService],
})
export class SecurityModule {}
