import { Module } from '@nestjs/common';

import { OrganizationsModule } from '../organizations/organizations.module';
import { PrismaModule } from '../prisma/prisma.module';

import { PointsController } from './points.controller';
import { PointsService } from './points.service';

@Module({
  imports: [PrismaModule, OrganizationsModule],
  controllers: [PointsController],
  providers: [PointsService],
  exports: [PointsService],
})
export class PointsModule {}
