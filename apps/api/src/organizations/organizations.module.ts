import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';

import { OrganizationRoleGuard } from './guards/organization-role.guard';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';

@Module({
  imports: [PrismaModule],
  controllers: [OrganizationsController],
  providers: [OrganizationsService, OrganizationRoleGuard],
  exports: [OrganizationsService, OrganizationRoleGuard],
})
export class OrganizationsModule {}
