import {
  Body,
  Controller,
  Delete,
  Get,
  ParseUUIDPipe,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { OrganizationRole } from '@prisma/client';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccessTokenPayload } from '../auth/auth.types';

import { RequireOrgRoles } from './decorators/require-org-roles.decorator';
import { AcceptMembershipInviteDto } from './dto/accept-membership-invite.dto';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { CreateJoinRequestDto } from './dto/create-join-request.dto';
import { DiscoverOrganizationsQueryDto } from './dto/discover-organizations-query.dto';
import { InviteMembershipDto } from './dto/invite-membership.dto';
import { ReviewJoinRequestDto } from './dto/review-join-request.dto';
import { UpdateMembershipDto } from './dto/update-membership.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { OrganizationRoleGuard } from './guards/organization-role.guard';
import { OrganizationsService } from './organizations.service';

@Controller('organizations')
@UseGuards(JwtAuthGuard)
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Post()
  async create(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: CreateOrganizationDto,
  ) {
    return this.organizationsService.createOrganization(user.sub, dto);
  }

  @Get('invitations/me')
  async myInvitations(@CurrentUser() user: AccessTokenPayload) {
    return this.organizationsService.listMyInvitations(user.sub);
  }

  @Post('invitations/:invitationId/accept')
  async acceptMyInvitation(
    @Param('invitationId', new ParseUUIDPipe({ version: '4' }))
    invitationId: string,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.organizationsService.acceptMyInvitation(invitationId, user.sub);
  }

  @Get('join-requests/me')
  async myJoinRequests(@CurrentUser() user: AccessTokenPayload) {
    return this.organizationsService.listMyJoinRequests(user.sub);
  }

  @Get()
  async myOrganizations(@CurrentUser() user: AccessTokenPayload) {
    return this.organizationsService.listMyOrganizations(user.sub);
  }

  @Get('discover')
  async discoverOrganizations(
    @CurrentUser() user: AccessTokenPayload,
    @Query() query: DiscoverOrganizationsQueryDto,
  ) {
    return this.organizationsService.discoverOrganizations(user.sub, query);
  }

  @Get(':organizationId')
  @UseGuards(OrganizationRoleGuard)
  async getById(
    @Param('organizationId', new ParseUUIDPipe({ version: '4' }))
    organizationId: string,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.organizationsService.getOrganization(organizationId, user.sub);
  }

  @Patch(':organizationId')
  @UseGuards(OrganizationRoleGuard)
  @RequireOrgRoles(OrganizationRole.ADMIN, OrganizationRole.DIRECTOR)
  async update(
    @Param('organizationId', new ParseUUIDPipe({ version: '4' }))
    organizationId: string,
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: UpdateOrganizationDto,
  ) {
    return this.organizationsService.updateOrganization(organizationId, user.sub, dto);
  }

  @Delete(':organizationId')
  @UseGuards(OrganizationRoleGuard)
  @RequireOrgRoles(OrganizationRole.ADMIN)
  async archive(
    @Param('organizationId', new ParseUUIDPipe({ version: '4' }))
    organizationId: string,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.organizationsService.archiveOrganization(organizationId, user.sub);
  }

  @Get(':organizationId/memberships')
  @UseGuards(OrganizationRoleGuard)
  @RequireOrgRoles(
    OrganizationRole.ADMIN,
    OrganizationRole.DIRECTOR,
    OrganizationRole.ASSISTANT,
  )
  async listMemberships(
    @Param('organizationId', new ParseUUIDPipe({ version: '4' }))
    organizationId: string,
  ) {
    return this.organizationsService.listMemberships(organizationId);
  }

  @Get(':organizationId/join-requests')
  @UseGuards(OrganizationRoleGuard)
  @RequireOrgRoles(OrganizationRole.ADMIN, OrganizationRole.DIRECTOR)
  async listJoinRequests(
    @Param('organizationId', new ParseUUIDPipe({ version: '4' }))
    organizationId: string,
  ) {
    return this.organizationsService.listOrganizationJoinRequests(organizationId);
  }

  @Post(':organizationId/invite')
  @Post(':organizationId/memberships/invite')
  @UseGuards(OrganizationRoleGuard)
  @RequireOrgRoles(OrganizationRole.ADMIN, OrganizationRole.DIRECTOR)
  async inviteMembership(
    @Param('organizationId', new ParseUUIDPipe({ version: '4' }))
    organizationId: string,
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: InviteMembershipDto,
  ) {
    return this.organizationsService.inviteMembership(organizationId, user.sub, dto);
  }

  @Post(':organizationId/join-requests')
  async createJoinRequest(
    @Param('organizationId', new ParseUUIDPipe({ version: '4' }))
    organizationId: string,
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: CreateJoinRequestDto,
  ) {
    return this.organizationsService.createJoinRequest(organizationId, user.sub, dto);
  }

  @Patch(':organizationId/join-requests/:requestId')
  @UseGuards(OrganizationRoleGuard)
  @RequireOrgRoles(OrganizationRole.ADMIN, OrganizationRole.DIRECTOR)
  async reviewJoinRequest(
    @Param('organizationId', new ParseUUIDPipe({ version: '4' }))
    organizationId: string,
    @Param('requestId', new ParseUUIDPipe({ version: '4' }))
    requestId: string,
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: ReviewJoinRequestDto,
  ) {
    return this.organizationsService.reviewJoinRequest(
      organizationId,
      requestId,
      user.sub,
      dto,
    );
  }

  @Post(':organizationId/memberships/:membershipId/accept')
  async acceptMembership(
    @Param('organizationId', new ParseUUIDPipe({ version: '4' }))
    organizationId: string,
    @Param('membershipId', new ParseUUIDPipe({ version: '4' }))
    membershipId: string,
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: AcceptMembershipInviteDto,
  ) {
    return this.organizationsService.acceptInvitation(
      organizationId,
      membershipId,
      user.sub,
      dto.inviteToken,
    );
  }

  @Patch(':organizationId/memberships/:membershipId')
  @UseGuards(OrganizationRoleGuard)
  @RequireOrgRoles(OrganizationRole.ADMIN)
  async updateMembership(
    @Param('organizationId', new ParseUUIDPipe({ version: '4' }))
    organizationId: string,
    @Param('membershipId', new ParseUUIDPipe({ version: '4' }))
    membershipId: string,
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: UpdateMembershipDto,
  ) {
    return this.organizationsService.updateMembership(
      organizationId,
      membershipId,
      user.sub,
      dto,
    );
  }

  @Delete(':organizationId/memberships/:membershipId')
  @UseGuards(OrganizationRoleGuard)
  @RequireOrgRoles(OrganizationRole.ADMIN)
  async removeMembership(
    @Param('organizationId', new ParseUUIDPipe({ version: '4' }))
    organizationId: string,
    @Param('membershipId', new ParseUUIDPipe({ version: '4' }))
    membershipId: string,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.organizationsService.removeMembership(
      organizationId,
      membershipId,
      user.sub,
    );
  }

  @Post(':organizationId/memberships/leave')
  async leaveOrganization(
    @Param('organizationId', new ParseUUIDPipe({ version: '4' }))
    organizationId: string,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.organizationsService.leaveOrganization(organizationId, user.sub);
  }
}
