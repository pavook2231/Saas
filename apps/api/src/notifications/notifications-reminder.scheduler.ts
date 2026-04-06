import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';

import { NotificationsService } from './notifications.service';

@Injectable()
export class NotificationsReminderScheduler {
  private readonly logger = new Logger(NotificationsReminderScheduler.name);
  private isRunning = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async run(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    try {
      const offsets =
        this.configService.get<number[]>('appConfig.notifications.reminderOffsetsMinutes') ??
        [1440, 60];

      for (const offset of offsets) {
        const result = await this.notificationsService.dispatchDueEventReminders(offset, 2);

        if (result.processed > 0) {
          this.logger.log(
            `Reminders offset=${offset}m processed=${result.processed} sent=${result.sent} skipped=${result.skipped} failed=${result.failed}`,
          );
        }
      }
    } catch (error) {
      this.logger.error(`Reminder cron failed: ${(error as Error).message}`);
    } finally {
      this.isRunning = false;
    }
  }
}
