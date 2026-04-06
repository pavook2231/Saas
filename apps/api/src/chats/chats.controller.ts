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

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccessTokenPayload } from '../auth/auth.types';
import { OrganizationRoleGuard } from '../organizations/guards/organization-role.guard';

import { ListChatMessagesQueryDto } from './dto/list-chat-messages-query.dto';
import { SendChatMessageDto } from './dto/send-chat-message.dto';
import { UpdateChatMessageDto } from './dto/update-chat-message.dto';
import { ChatsService } from './chats.service';

@Controller('organizations/:organizationId/chats')
@UseGuards(JwtAuthGuard, OrganizationRoleGuard)
export class ChatsController {
  constructor(private readonly chatsService: ChatsService) {}

  @Get('organization/messages')
  async listOrganizationMessages(
    @Param('organizationId', new ParseUUIDPipe({ version: '4' }))
    organizationId: string,
    @Query() query: ListChatMessagesQueryDto,
  ) {
    return this.chatsService.listOrganizationMessages(organizationId, query);
  }

  @Post('organization/messages')
  async sendOrganizationMessage(
    @Param('organizationId', new ParseUUIDPipe({ version: '4' }))
    organizationId: string,
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: SendChatMessageDto,
  ) {
    return this.chatsService.sendOrganizationMessage(organizationId, user.sub, dto);
  }

  @Get('events/:eventId/messages')
  async listEventMessages(
    @Param('organizationId', new ParseUUIDPipe({ version: '4' }))
    organizationId: string,
    @Param('eventId', new ParseUUIDPipe({ version: '4' }))
    eventId: string,
    @Query() query: ListChatMessagesQueryDto,
  ) {
    return this.chatsService.listEventMessages(organizationId, eventId, query);
  }

  @Post('events/:eventId/messages')
  async sendEventMessage(
    @Param('organizationId', new ParseUUIDPipe({ version: '4' }))
    organizationId: string,
    @Param('eventId', new ParseUUIDPipe({ version: '4' }))
    eventId: string,
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: SendChatMessageDto,
  ) {
    return this.chatsService.sendEventMessage(organizationId, eventId, user.sub, dto);
  }

  @Patch('messages/:messageId')
  async updateMessage(
    @Param('organizationId', new ParseUUIDPipe({ version: '4' }))
    organizationId: string,
    @Param('messageId', new ParseUUIDPipe({ version: '4' }))
    messageId: string,
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: UpdateChatMessageDto,
  ) {
    return this.chatsService.updateMessage(organizationId, messageId, user.sub, dto);
  }

  @Delete('messages/:messageId')
  async deleteMessage(
    @Param('organizationId', new ParseUUIDPipe({ version: '4' }))
    organizationId: string,
    @Param('messageId', new ParseUUIDPipe({ version: '4' }))
    messageId: string,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.chatsService.deleteMessage(organizationId, messageId, user.sub);
  }
}
