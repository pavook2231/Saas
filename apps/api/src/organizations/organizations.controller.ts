import {
  Body,
  Controller,
  Delete,
  Get,
  ParseUUIDPipe,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { OrganizationRole } from '@prisma/client';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccessTokenPayload } from '../auth/auth.types';

import { RequireOrgRoles } from './decorators/require-org-roles.decorator';
import { AcceptMembershipInviteDto } from './dto/accept-membership-invite.dto';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { InviteMembershipDto } from './dto/invite-membership.dto';
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

  @Get('invitations/me/history')
  async myInvitationHistory(@CurrentUser() user: AccessTokenPayload) {
    return this.organizationsService.listMyInvitationHistory(user.sub);
  }

  @Post('invitations/:invitationId/accept')
  async acceptMyInvitation(
    @Param('invitationId', new ParseUUIDPipe({ version: '4' }))
    invitationId: string,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.organizationsService.acceptMyInvitation(invitationId, user.sub);
  }

  @Post('invitations/:invitationId/decline')
  async declineMyInvitation(
    @Param('invitationId', new ParseUUIDPipe({ version: '4' }))
    invitationId: string,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.organizationsService.declineMyInvitation(invitationId, user.sub);
  }

  @Get()
  async myOrganizations(@CurrentUser() user: AccessTokenPayload) {
    return this.organizationsService.listMyOrganizations(user.sub);
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

  @Get(':organizationId/invitations')
  @UseGuards(OrganizationRoleGuard)
  @RequireOrgRoles(OrganizationRole.ADMIN)
  async listInvitations(
    @Param('organizationId', new ParseUUIDPipe({ version: '4' }))
    organizationId: string,
  ) {
    return this.organizationsService.listOrganizationInvitations(organizationId);
  }

  @Post(':organizationId/invite')
  @Post(':organizationId/memberships/invite')
  @UseGuards(OrganizationRoleGuard)
  @RequireOrgRoles(OrganizationRole.ADMIN)
  async inviteMembership(
    @Param('organizationId', new ParseUUIDPipe({ version: '4' }))
    organizationId: string,
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: InviteMembershipDto,
  ) {
    return this.organizationsService.inviteMembership(organizationId, user.sub, dto);
  }

  @Post(':organizationId/invitations/:invitationId/revoke')
  @UseGuards(OrganizationRoleGuard)
  @RequireOrgRoles(OrganizationRole.ADMIN)
  async revokeInvitation(
    @Param('organizationId', new ParseUUIDPipe({ version: '4' }))
    organizationId: string,
    @Param('invitationId', new ParseUUIDPipe({ version: '4' }))
    invitationId: string,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.organizationsService.revokeInvitation(
      organizationId,
      invitationId,
      user.sub,
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
  @RequireOrgRoles(OrganizationRole.ADMIN, OrganizationRole.DIRECTOR)
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
  @RequireOrgRoles(OrganizationRole.ADMIN, OrganizationRole.DIRECTOR)
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
