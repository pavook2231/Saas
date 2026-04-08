import { Body, Controller, Patch, Post, UseGuards } from '@nestjs/common';

import { AccessTokenPayload, MeResponse } from './auth.types';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('auth/account')
@UseGuards(JwtAuthGuard)
export class AccountController {
  constructor(private readonly authService: AuthService) {}

  @Patch()
  async updateProfile(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: UpdateProfileDto,
  ): Promise<MeResponse> {
    return this.authService.updateProfile(user.sub, dto);
  }

  @Post('password')
  async changePassword(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: ChangePasswordDto,
  ): Promise<{ success: true }> {
    await this.authService.changePassword(user.sub, dto);
    return { success: true };
  }
}
