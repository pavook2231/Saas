import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { OrganizationRole } from '@prisma/client';

import { AccessTokenPayload } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequireOrgRoles } from '../organizations/decorators/require-org-roles.decorator';
import { OrganizationRoleGuard } from '../organizations/guards/organization-role.guard';

import { CheckEventConflictsDto } from './dto/check-event-conflicts.dto';
import { CreateEventDto } from './dto/create-event.dto';
import { CreateParticipantDto } from './dto/create-participant.dto';
import { CreateTemplateDto } from './dto/create-template.dto';
import { ListEventsQueryDto } from './dto/list-events-query.dto';
import { ListParticipantsQueryDto } from './dto/list-participants-query.dto';
import { ListTemplatesQueryDto } from './dto/list-templates-query.dto';
import { PublishWeekScheduleDto } from './dto/publish-week-schedule.dto';
import { SetEventParticipantsDto } from './dto/set-event-participants.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { UpdateParticipantDto } from './dto/update-participant.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { EventsService } from './events.service';

@Controller('organizations/:organizationId')
@UseGuards(JwtAuthGuard, OrganizationRoleGuard)
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get('participants')
  async listParticipants(
    @Param('organizationId', new ParseUUIDPipe({ version: '4' }))
    organizationId: string,
    @CurrentUser() user: AccessTokenPayload,
    @Query() query: ListParticipantsQueryDto,
  ) {
    return this.eventsService.listParticipants(organizationId, user.sub, query);
  }

  @Get('participants/:participantId')
  async getParticipant(
    @Param('organizationId', new ParseUUIDPipe({ version: '4' }))
    organizationId: string,
    @Param('participantId', new ParseUUIDPipe({ version: '4' }))
    participantId: string,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.eventsService.getParticipant(organizationId, participantId, user.sub);
  }

  @Post('participants')
  @RequireOrgRoles(
    OrganizationRole.ADMIN,
    OrganizationRole.DIRECTOR,
    OrganizationRole.ASSISTANT,
  )
  async createParticipant(
    @Param('organizationId', new ParseUUIDPipe({ version: '4' }))
    organizationId: string,
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: CreateParticipantDto,
  ) {
    return this.eventsService.createParticipant(organizationId, user.sub, dto);
  }

  @Patch('participants/:participantId')
  @RequireOrgRoles(
    OrganizationRole.ADMIN,
    OrganizationRole.DIRECTOR,
    OrganizationRole.ASSISTANT,
  )
  async updateParticipant(
    @Param('organizationId', new ParseUUIDPipe({ version: '4' }))
    organizationId: string,
    @Param('participantId', new ParseUUIDPipe({ version: '4' }))
    participantId: string,
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: UpdateParticipantDto,
  ) {
    return this.eventsService.updateParticipant(
      organizationId,
      participantId,
      user.sub,
      dto,
    );
  }

  @Delete('participants/:participantId')
  @RequireOrgRoles(
    OrganizationRole.ADMIN,
    OrganizationRole.DIRECTOR,
    OrganizationRole.ASSISTANT,
  )
  async archiveParticipant(
    @Param('organizationId', new ParseUUIDPipe({ version: '4' }))
    organizationId: string,
    @Param('participantId', new ParseUUIDPipe({ version: '4' }))
    participantId: string,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.eventsService.archiveParticipant(organizationId, participantId, user.sub);
  }

  @Get('templates')
  async listTemplates(
    @Param('organizationId', new ParseUUIDPipe({ version: '4' }))
    organizationId: string,
    @Query() query: ListTemplatesQueryDto,
  ) {
    return this.eventsService.listTemplates(organizationId, query);
  }

  @Get('templates/:templateId')
  async getTemplate(
    @Param('organizationId', new ParseUUIDPipe({ version: '4' }))
    organizationId: string,
    @Param('templateId', new ParseUUIDPipe({ version: '4' }))
    templateId: string,
  ) {
    return this.eventsService.getTemplate(organizationId, templateId);
  }

  @Post('templates')
  @RequireOrgRoles(
    OrganizationRole.ADMIN,
    OrganizationRole.DIRECTOR,
    OrganizationRole.ASSISTANT,
  )
  async createTemplate(
    @Param('organizationId', new ParseUUIDPipe({ version: '4' }))
    organizationId: string,
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: CreateTemplateDto,
  ) {
    return this.eventsService.createTemplate(organizationId, user.sub, dto);
  }

  @Patch('templates/:templateId')
  @RequireOrgRoles(
    OrganizationRole.ADMIN,
    OrganizationRole.DIRECTOR,
    OrganizationRole.ASSISTANT,
  )
  async updateTemplate(
    @Param('organizationId', new ParseUUIDPipe({ version: '4' }))
    organizationId: string,
    @Param('templateId', new ParseUUIDPipe({ version: '4' }))
    templateId: string,
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: UpdateTemplateDto,
  ) {
    return this.eventsService.updateTemplate(organizationId, templateId, user.sub, dto);
  }

  @Delete('templates/:templateId')
  @RequireOrgRoles(
    OrganizationRole.ADMIN,
    OrganizationRole.DIRECTOR,
    OrganizationRole.ASSISTANT,
  )
  async archiveTemplate(
    @Param('organizationId', new ParseUUIDPipe({ version: '4' }))
    organizationId: string,
    @Param('templateId', new ParseUUIDPipe({ version: '4' }))
    templateId: string,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.eventsService.archiveTemplate(organizationId, templateId, user.sub);
  }

  @Post('events/conflicts/check')
  @RequireOrgRoles(
    OrganizationRole.ADMIN,
    OrganizationRole.DIRECTOR,
    OrganizationRole.ASSISTANT,
  )
  async checkEventConflicts(
    @Param('organizationId', new ParseUUIDPipe({ version: '4' }))
    organizationId: string,
    @Body() dto: CheckEventConflictsDto,
  ) {
    return this.eventsService.checkEventConflicts(organizationId, dto);
  }

  @Get('events')
  async listEvents(
    @Param('organizationId', new ParseUUIDPipe({ version: '4' }))
    organizationId: string,
    @CurrentUser() user: AccessTokenPayload,
    @Query() query: ListEventsQueryDto,
  ) {
    return this.eventsService.listEvents(organizationId, user.sub, query);
  }

  @Post('events/week/publish')
  @RequireOrgRoles(
    OrganizationRole.ADMIN,
    OrganizationRole.DIRECTOR,
    OrganizationRole.ASSISTANT,
  )
  async publishWeekSchedule(
    @Param('organizationId', new ParseUUIDPipe({ version: '4' }))
    organizationId: string,
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: PublishWeekScheduleDto,
  ) {
    return this.eventsService.publishWeekSchedule(organizationId, user.sub, dto);
  }

  @Get('events/:eventId')
  async getEvent(
    @Param('organizationId', new ParseUUIDPipe({ version: '4' }))
    organizationId: string,
    @Param('eventId', new ParseUUIDPipe({ version: '4' }))
    eventId: string,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.eventsService.getEvent(organizationId, eventId, user.sub);
  }

  @Get('events/:eventId/history')
  @RequireOrgRoles(
    OrganizationRole.ADMIN,
    OrganizationRole.DIRECTOR,
    OrganizationRole.ASSISTANT,
  )
  async listEventHistory(
    @Param('organizationId', new ParseUUIDPipe({ version: '4' }))
    organizationId: string,
    @Param('eventId', new ParseUUIDPipe({ version: '4' }))
    eventId: string,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.eventsService.listEventHistory(organizationId, eventId, user.sub);
  }

  @Post('events')
  @RequireOrgRoles(
    OrganizationRole.ADMIN,
    OrganizationRole.DIRECTOR,
    OrganizationRole.ASSISTANT,
  )
  async createEvent(
    @Param('organizationId', new ParseUUIDPipe({ version: '4' }))
    organizationId: string,
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: CreateEventDto,
  ) {
    return this.eventsService.createEvent(organizationId, user.sub, dto);
  }

  @Patch('events/:eventId')
  @RequireOrgRoles(
    OrganizationRole.ADMIN,
    OrganizationRole.DIRECTOR,
    OrganizationRole.ASSISTANT,
  )
  async updateEvent(
    @Param('organizationId', new ParseUUIDPipe({ version: '4' }))
    organizationId: string,
    @Param('eventId', new ParseUUIDPipe({ version: '4' }))
    eventId: string,
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: UpdateEventDto,
  ) {
    return this.eventsService.updateEvent(organizationId, eventId, user.sub, dto);
  }

  @Post('events/:eventId/remind')
  @RequireOrgRoles(
    OrganizationRole.ADMIN,
    OrganizationRole.DIRECTOR,
    OrganizationRole.ASSISTANT,
  )
  async sendEventReminderNow(
    @Param('organizationId', new ParseUUIDPipe({ version: '4' }))
    organizationId: string,
    @Param('eventId', new ParseUUIDPipe({ version: '4' }))
    eventId: string,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.eventsService.sendEventReminderNow(organizationId, eventId, user.sub);
  }

  @Put('events/:eventId/participants')
  @RequireOrgRoles(
    OrganizationRole.ADMIN,
    OrganizationRole.DIRECTOR,
    OrganizationRole.ASSISTANT,
  )
  async replaceEventParticipants(
    @Param('organizationId', new ParseUUIDPipe({ version: '4' }))
    organizationId: string,
    @Param('eventId', new ParseUUIDPipe({ version: '4' }))
    eventId: string,
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: SetEventParticipantsDto,
  ) {
    return this.eventsService.replaceEventParticipants(
      organizationId,
      eventId,
      user.sub,
      dto,
    );
  }

  @Delete('events/:eventId')
  @RequireOrgRoles(
    OrganizationRole.ADMIN,
    OrganizationRole.DIRECTOR,
    OrganizationRole.ASSISTANT,
  )
  async archiveEvent(
    @Param('organizationId', new ParseUUIDPipe({ version: '4' }))
    organizationId: string,
    @Param('eventId', new ParseUUIDPipe({ version: '4' }))
    eventId: string,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.eventsService.archiveEvent(organizationId, eventId, user.sub);
  }
}
