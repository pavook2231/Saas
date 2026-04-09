import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccessTokenPayload } from '../auth/auth.types';

import { ListMyNotificationsQueryDto } from './dto/list-my-notifications-query.dto';
import { RegisterPushDeviceDto } from './dto/register-push-device.dto';
import { RegisterWebPushSubscriptionDto } from './dto/register-web-push-subscription.dto';
import { UnregisterPushDeviceDto } from './dto/unregister-push-device.dto';
import { UnregisterWebPushSubscriptionDto } from './dto/unregister-web-push-subscription.dto';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get('me')
  async myNotifications(
    @CurrentUser() user: AccessTokenPayload,
    @Query() query: ListMyNotificationsQueryDto,
  ) {
    return this.notificationsService.listMyNotifications(user.sub, query);
  }

  @Patch('me/:recipientId/read')
  async markAsRead(
    @CurrentUser() user: AccessTokenPayload,
    @Param('recipientId', new ParseUUIDPipe({ version: '4' }))
    recipientId: string,
  ) {
    return this.notificationsService.markAsRead(user.sub, recipientId);
  }

  @Post('push/register')
  async registerPushDevice(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: RegisterPushDeviceDto,
  ) {
    return this.notificationsService.registerPushDevice(user.sub, dto);
  }

  @Post('push/unregister')
  async unregisterPushDevice(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: UnregisterPushDeviceDto,
  ) {
    return this.notificationsService.unregisterPushDevice(user.sub, dto);
  }

  @Get('push/web')
  async myWebPushSubscriptions(@CurrentUser() user: AccessTokenPayload) {
    return this.notificationsService.listMyWebPushSubscriptions(user.sub);
  }

  @Post('push/web/subscribe')
  async registerWebPushSubscription(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: RegisterWebPushSubscriptionDto,
  ) {
    return this.notificationsService.registerWebPushSubscription(user.sub, dto);
  }

  @Post('push/web/unsubscribe')
  async unregisterWebPushSubscription(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: UnregisterWebPushSubscriptionDto,
  ) {
    return this.notificationsService.unregisterWebPushSubscription(user.sub, dto);
  }
}
