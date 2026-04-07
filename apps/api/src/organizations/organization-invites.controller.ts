import {
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';

import { AccessTokenPayload } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';

import { OrganizationsService } from './organizations.service';

type RequestWithOptionalUser = Request & {
  user?: AccessTokenPayload;
};

@Controller()
export class OrganizationInvitesController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get('invite/:token')
  async getInvitation(@Param('token') token: string) {
    return this.organizationsService.getInvitationByToken(token);
  }

  @UseGuards(JwtAuthGuard)
  @Post('invite/:token/accept')
  async acceptInvitation(
    @Param('token') token: string,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.organizationsService.acceptInvitationByToken(token, user.sub);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get('join/:inviteCode')
  async getJoinLink(
    @Param('inviteCode') inviteCode: string,
    @Req() request: RequestWithOptionalUser,
  ) {
    if (request.user?.sub) {
      return this.organizationsService.acceptJoinByInviteCode(
        inviteCode,
        request.user.sub,
      );
    }

    return this.organizationsService.getJoinByInviteCode(inviteCode);
  }

  @UseGuards(JwtAuthGuard)
  @Post('join/:inviteCode/accept')
  async acceptJoinLink(
    @Param('inviteCode') inviteCode: string,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.organizationsService.acceptJoinByInviteCode(inviteCode, user.sub);
  }
}
