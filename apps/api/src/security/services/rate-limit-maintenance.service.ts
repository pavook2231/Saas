import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class RateLimitMaintenanceService {
  private readonly logger = new Logger(RateLimitMaintenanceService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron('*/10 * * * *')
  async cleanupExpiredCounters(): Promise<void> {
    try {
      const result = await this.prisma.securityRateLimit.deleteMany({
        where: {
          resetAt: {
            lt: new Date(),
          },
        },
      });

      if (result.count > 0) {
        this.logger.log(`Cleaned up ${result.count} expired rate-limit counters`);
      }
    } catch (error) {
      this.logger.warn(
        `Failed to clean up expired rate-limit counters: ${(error as Error).message}`,
      );
    }
  }
}
