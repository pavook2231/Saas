import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { NotificationsService } from './notifications.service';

@Injectable()
export class NotificationsReminderScheduler {
  private readonly logger = new Logger(NotificationsReminderScheduler.name);
  private isRunning = false;

  constructor(
    private readonly notificationsService: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async run(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    try {
      const result = await this.notificationsService.dispatchNextDayEventRemindersAtHour(20, 2);

      if (result.processed > 0) {
        this.logger.log(
          `Next-day reminders processed=${result.processed} sent=${result.sent} skipped=${result.skipped} failed=${result.failed}`,
        );
      }
    } catch (error) {
      this.logger.error(`Reminder cron failed: ${(error as Error).message}`);
    } finally {
      this.isRunning = false;
    }
  }
}
