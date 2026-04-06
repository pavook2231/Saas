import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';

import { PrismaModule } from '../prisma/prisma.module';
import { SecurityModule } from '../security/security.module';

import { NotificationsController } from './notifications.controller';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationsReminderScheduler } from './notifications-reminder.scheduler';
import { NotificationsService } from './notifications.service';
import { FirebasePushService } from './services/firebase-push.service';

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    SecurityModule,
    JwtModule.register({}),
    ScheduleModule,
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsGateway,
    NotificationsService,
    NotificationsReminderScheduler,
    FirebasePushService,
  ],
  exports: [NotificationsGateway, NotificationsService],
})
export class NotificationsModule {}
