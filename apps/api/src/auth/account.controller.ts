import { Body, Controller, Get, Header, Param, Patch, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';

import { RateLimit } from '../security/decorators/rate-limit.decorator';

import {
  AccessTokenPayload,
  MeResponse,
  TotpSetupResponse,
  TwoFactorStatusResponse,
  CalendarSyncLinksResponse,
} from './auth.types';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { BeginTotpSetupDto } from './dto/begin-totp-setup.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { DisableTotpDto } from './dto/disable-totp.dto';
import { EnableTotpDto } from './dto/enable-totp.dto';
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

  @Get('calendar-sync')
  async getCalendarSyncLinks(
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<CalendarSyncLinksResponse> {
    return this.authService.getCalendarSyncLinks(user.sub);
  }

  @Post('calendar-sync/rotate')
  async rotateCalendarSyncLinks(
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<CalendarSyncLinksResponse> {
    return this.authService.rotateCalendarSyncLinks(user.sub);
  }

  @Post('password')
  @RateLimit({ bucket: 'auth' })
  async changePassword(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: ChangePasswordDto,
  ): Promise<{ success: true }> {
    await this.authService.changePassword(user.sub, dto);
    return { success: true };
  }

  @Post('two-factor')
  async getTwoFactorStatus(
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<TwoFactorStatusResponse> {
    return this.authService.getTwoFactorStatus(user.sub);
  }

  @Post('two-factor/setup')
  @RateLimit({ bucket: 'auth' })
  async beginTotpSetup(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: BeginTotpSetupDto,
  ): Promise<TotpSetupResponse> {
    return this.authService.beginTotpSetup(user.sub, dto.currentPassword);
  }

  @Post('two-factor/enable')
  @RateLimit({ bucket: 'auth' })
  async enableTotp(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: EnableTotpDto,
  ): Promise<TwoFactorStatusResponse> {
    return this.authService.enableTotp(user.sub, dto);
  }

  @Post('two-factor/disable')
  @RateLimit({ bucket: 'auth' })
  async disableTotp(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: DisableTotpDto,
  ): Promise<TwoFactorStatusResponse> {
    return this.authService.disableTotp(user.sub, dto);
  }
}

@Controller('calendar/subscriptions')
export class CalendarSubscriptionController {
  constructor(private readonly authService: AuthService) {}

  @Get(':token.ics')
  @Header('Content-Type', 'text/calendar; charset=utf-8')
  @Header('Content-Disposition', 'inline; filename=\"theatre-calendar.ics\"')
  async getCalendarFeed(
    @Param('token') token: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    const feed = await this.authService.getCalendarSubscriptionFeed(token);
    const ifNoneMatch = request.headers['if-none-match'];
    const ifModifiedSince = request.headers['if-modified-since'];

    response.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
    response.setHeader('ETag', `"${feed.etag}"`);
    response.setHeader('Last-Modified', feed.lastModified.toUTCString());

    if (
      ifNoneMatch === `"${feed.etag}"` ||
      (typeof ifModifiedSince === 'string' &&
        Number.isFinite(Date.parse(ifModifiedSince)) &&
        new Date(ifModifiedSince).getTime() >= feed.lastModified.getTime())
    ) {
      response.status(304);
      return '';
    }

    return feed.body;
  }
}
