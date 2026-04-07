import {
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccessTokenPayload } from '../auth/auth.types';

import { OrganizationsService } from './organizations.service';

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
}
