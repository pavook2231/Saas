import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { SkipRateLimit } from '../security/decorators/rate-limit.decorator';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @SkipRateLimit()
  async check(): Promise<{
    status: 'ok' | 'degraded';
    timestamp: string;
    database: 'up' | 'down';
  }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;

      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        database: 'up',
      };
    } catch {
      throw new ServiceUnavailableException({
        status: 'degraded',
        timestamp: new Date().toISOString(),
        database: 'down',
      });
    }
  }
}
