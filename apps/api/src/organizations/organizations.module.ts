import { Module } from '@nestjs/common';

import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';

import { OrganizationInvitesController } from './organization-invites.controller';
import { OrganizationRoleGuard } from './guards/organization-role.guard';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [OrganizationsController, OrganizationInvitesController],
  providers: [OrganizationsService, OrganizationRoleGuard, OptionalJwtAuthGuard],
  exports: [OrganizationsService, OrganizationRoleGuard, OptionalJwtAuthGuard],
})
export class OrganizationsModule {}

