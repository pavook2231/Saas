import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { OrganizationRole } from '@prisma/client';

import { AccessTokenPayload } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequireOrgRoles } from '../organizations/decorators/require-org-roles.decorator';
import { OrganizationRoleGuard } from '../organizations/guards/organization-role.guard';

import { CreateManualPointsDto } from './dto/create-manual-points.dto';
import { DeleteManualPointsDto } from './dto/delete-manual-points.dto';
import { ListManualPointsQueryDto } from './dto/list-manual-points-query.dto';
import { PointsPeriodQueryDto } from './dto/points-period-query.dto';
import { RunAutoPointsForEventDto } from './dto/run-auto-points-for-event.dto';
import { UpdateManualPointsDto } from './dto/update-manual-points.dto';
import { UpdatePointsConfigDto } from './dto/update-points-config.dto';
import { PointsService } from './points.service';

@Controller('organizations/:organizationId/points')
@UseGuards(JwtAuthGuard, OrganizationRoleGuard)
export class PointsController {
  constructor(private readonly pointsService: PointsService) {}

  @Get('config')
  @RequireOrgRoles(
    OrganizationRole.ADMIN,
    OrganizationRole.DIRECTOR,
    OrganizationRole.ASSISTANT,
  )
  async getConfig(
    @Param('organizationId', new ParseUUIDPipe({ version: '4' }))
    organizationId: string,
  ) {
    return this.pointsService.getPointsConfig(organizationId);
  }

  @Patch('config')
  @RequireOrgRoles(
    OrganizationRole.ADMIN,
    OrganizationRole.DIRECTOR,
    OrganizationRole.ASSISTANT,
  )
  async updateConfig(
    @Param('organizationId', new ParseUUIDPipe({ version: '4' }))
    organizationId: string,
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: UpdatePointsConfigDto,
  ) {
    return this.pointsService.updatePointsConfig(organizationId, user.sub, dto);
  }

  @Get('period')
  @RequireOrgRoles(
    OrganizationRole.ADMIN,
    OrganizationRole.DIRECTOR,
    OrganizationRole.ASSISTANT,
  )
  async getPeriod(
    @Param('organizationId', new ParseUUIDPipe({ version: '4' }))
    organizationId: string,
    @Query() query: PointsPeriodQueryDto,
  ) {
    return this.pointsService.getPeriod(organizationId, query);
  }

  @Get('period/summary')
  @RequireOrgRoles(
    OrganizationRole.ADMIN,
    OrganizationRole.DIRECTOR,
    OrganizationRole.ASSISTANT,
  )
  async getPeriodSummary(
    @Param('organizationId', new ParseUUIDPipe({ version: '4' }))
    organizationId: string,
    @Query() query: PointsPeriodQueryDto,
  ) {
    return this.pointsService.getPeriodSummary(organizationId, query);
  }

  @Post('auto/events/:eventId/run')
  @RequireOrgRoles(
    OrganizationRole.ADMIN,
    OrganizationRole.DIRECTOR,
    OrganizationRole.ASSISTANT,
  )
  async runAutoPointsForEvent(
    @Param('organizationId', new ParseUUIDPipe({ version: '4' }))
    organizationId: string,
    @Param('eventId', new ParseUUIDPipe({ version: '4' }))
    eventId: string,
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: RunAutoPointsForEventDto,
  ) {
    return this.pointsService.runAutoPointsForEvent(organizationId, eventId, user.sub, dto);
  }

  @Get('manual')
  @RequireOrgRoles(
    OrganizationRole.ADMIN,
    OrganizationRole.DIRECTOR,
    OrganizationRole.ASSISTANT,
  )
  async listManualPoints(
    @Param('organizationId', new ParseUUIDPipe({ version: '4' }))
    organizationId: string,
    @Query() query: ListManualPointsQueryDto,
  ) {
    return this.pointsService.listManualPoints(organizationId, query);
  }

  @Post('manual')
  @RequireOrgRoles(
    OrganizationRole.ADMIN,
    OrganizationRole.DIRECTOR,
    OrganizationRole.ASSISTANT,
  )
  async createManualPoints(
    @Param('organizationId', new ParseUUIDPipe({ version: '4' }))
    organizationId: string,
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: CreateManualPointsDto,
  ) {
    return this.pointsService.createManualPoints(organizationId, user.sub, dto);
  }

  @Patch('manual/:adjustmentId')
  @RequireOrgRoles(
    OrganizationRole.ADMIN,
    OrganizationRole.DIRECTOR,
    OrganizationRole.ASSISTANT,
  )
  async updateManualPoints(
    @Param('organizationId', new ParseUUIDPipe({ version: '4' }))
    organizationId: string,
    @Param('adjustmentId', new ParseUUIDPipe({ version: '4' }))
    adjustmentId: string,
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: UpdateManualPointsDto,
  ) {
    return this.pointsService.updateManualPoints(
      organizationId,
      adjustmentId,
      user.sub,
      dto,
    );
  }

  @Delete('manual/:adjustmentId')
  @RequireOrgRoles(
    OrganizationRole.ADMIN,
    OrganizationRole.DIRECTOR,
    OrganizationRole.ASSISTANT,
  )
  async deleteManualPoints(
    @Param('organizationId', new ParseUUIDPipe({ version: '4' }))
    organizationId: string,
    @Param('adjustmentId', new ParseUUIDPipe({ version: '4' }))
    adjustmentId: string,
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: DeleteManualPointsDto,
  ) {
    return this.pointsService.deleteManualPoints(
      organizationId,
      adjustmentId,
      user.sub,
      dto,
    );
  }
}
