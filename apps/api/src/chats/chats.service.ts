import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditTargetType,
  ChatScope,
  MembershipStatus,
  OrganizationRole,
  Prisma,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { DataEncryptionService } from '../security/services/data-encryption.service';

import { ListChatMessagesQueryDto } from './dto/list-chat-messages-query.dto';
import { SendChatMessageDto } from './dto/send-chat-message.dto';
import { UpdateChatMessageDto } from './dto/update-chat-message.dto';
import { ChatsGateway } from './gateways/chats.gateway';

const DEFAULT_LIST_LIMIT = 50;

const moderatorRoles = new Set<OrganizationRole>([
  OrganizationRole.ADMIN,
  OrganizationRole.DIRECTOR,
  OrganizationRole.ASSISTANT,
]);

const chatMessageSelect = {
  id: true,
  organizationId: true,
  eventId: true,
  scope: true,
  body: true,
  createdAt: true,
  updatedAt: true,
  editedAt: true,
  deletedAt: true,
  sender: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      avatarUrl: true,
    },
  },
} satisfies Prisma.ChatMessageSelect;

type ChatMessageRecord = Prisma.ChatMessageGetPayload<{
  select: typeof chatMessageSelect;
}>;

@Injectable()
export class ChatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: ChatsGateway,
    private readonly dataEncryptionService: DataEncryptionService,
  ) {}

  async listOrganizationMessages(
    organizationId: string,
    query: ListChatMessagesQueryDto,
  ) {
    await this.ensureOrganizationExists(organizationId);

    return this.listMessages(
      {
        organizationId,
        scope: ChatScope.ORGANIZATION,
        eventId: null,
        deletedAt: null,
      },
      query,
    );
  }

  async listEventMessages(
    organizationId: string,
    eventId: string,
    query: ListChatMessagesQueryDto,
  ) {
    await this.ensureEventExists(organizationId, eventId);

    return this.listMessages(
      {
        organizationId,
        scope: ChatScope.EVENT,
        eventId,
        deletedAt: null,
      },
      query,
    );
  }

  async sendOrganizationMessage(
    organizationId: string,
    actorUserId: string,
    dto: SendChatMessageDto,
  ) {
    await this.ensureOrganizationExists(organizationId);
    const body = this.normalizeMessageBody(dto.body);

    const message = await this.prisma.chatMessage.create({
      data: {
        organizationId,
        senderUserId: actorUserId,
        scope: ChatScope.ORGANIZATION,
        body: this.encryptMessageBody(body, organizationId, ChatScope.ORGANIZATION, null),
      },
      select: chatMessageSelect,
    });

    await this.prisma.auditLog.create({
      data: {
        organizationId,
        actorUserId,
        targetType: AuditTargetType.CHAT,
        targetId: message.id,
        action: 'chat.message.created',
        description: 'Organization chat message sent',
        payload: this.toAuditPayload({
          scope: message.scope,
          eventId: null,
        }),
      },
    });

    const payload = this.mapMessage(message);
    this.gateway.emitToOrganizationChat(organizationId, 'chat:message:new', payload);

    return payload;
  }

  async sendEventMessage(
    organizationId: string,
    eventId: string,
    actorUserId: string,
    dto: SendChatMessageDto,
  ) {
    await this.ensureEventExists(organizationId, eventId);
    const body = this.normalizeMessageBody(dto.body);

    const message = await this.prisma.chatMessage.create({
      data: {
        organizationId,
        eventId,
        senderUserId: actorUserId,
        scope: ChatScope.EVENT,
        body: this.encryptMessageBody(body, organizationId, ChatScope.EVENT, eventId),
      },
      select: chatMessageSelect,
    });

    await this.prisma.auditLog.create({
      data: {
        organizationId,
        actorUserId,
        targetType: AuditTargetType.CHAT,
        targetId: message.id,
        action: 'chat.message.created',
        description: 'Event chat message sent',
        payload: this.toAuditPayload({
          scope: message.scope,
          eventId,
        }),
      },
    });

    const payload = this.mapMessage(message);
    this.gateway.emitToEventChat(eventId, 'chat:message:new', payload);
    this.gateway.emitToOrganizationChat(organizationId, 'chat:message:new', payload);

    return payload;
  }

  async updateMessage(
    organizationId: string,
    messageId: string,
    actorUserId: string,
    dto: UpdateChatMessageDto,
  ) {
    const message = await this.findMessageOrThrow(organizationId, messageId);
    await this.ensureMessageCanBeModified(message);
    await this.ensureCanEditOrDelete(message, actorUserId);

    const nextBody = this.normalizeMessageBody(dto.body);

    const updated = await this.prisma.chatMessage.update({
      where: {
        id: message.id,
      },
      data: {
        body: this.encryptMessageBody(
          nextBody,
          message.organizationId,
          message.scope,
          message.eventId,
        ),
        editedAt: new Date(),
      },
      select: chatMessageSelect,
    });

    await this.prisma.auditLog.create({
      data: {
        organizationId,
        actorUserId,
        targetType: AuditTargetType.CHAT,
        targetId: updated.id,
        action: 'chat.message.updated',
        description: 'Chat message updated',
        payload: this.toAuditPayload({
          scope: updated.scope,
          eventId: updated.eventId,
        }),
      },
    });

    const payload = this.mapMessage(updated);
    this.emitMessageUpdated(payload);

    return payload;
  }

  async deleteMessage(
    organizationId: string,
    messageId: string,
    actorUserId: string,
  ) {
    const message = await this.findMessageOrThrow(organizationId, messageId);
    await this.ensureMessageCanBeModified(message);
    await this.ensureCanEditOrDelete(message, actorUserId);

    const deletedAt = new Date();

    const deleted = await this.prisma.chatMessage.update({
      where: {
        id: message.id,
      },
      data: {
        body: this.encryptMessageBody(
          '[deleted]',
          message.organizationId,
          message.scope,
          message.eventId,
        ),
        deletedAt,
        editedAt: deletedAt,
      },
      select: chatMessageSelect,
    });

    await this.prisma.auditLog.create({
      data: {
        organizationId,
        actorUserId,
        targetType: AuditTargetType.CHAT,
        targetId: deleted.id,
        action: 'chat.message.deleted',
        description: 'Chat message deleted',
        payload: this.toAuditPayload({
          scope: deleted.scope,
          eventId: deleted.eventId,
        }),
      },
    });

    const payload = this.mapMessage(deleted);
    this.emitMessageDeleted(payload);

    return {
      success: true as const,
      messageId: deleted.id,
      deletedAt: deletedAt.toISOString(),
    };
  }

  private async listMessages(
    where: Prisma.ChatMessageWhereInput,
    query: ListChatMessagesQueryDto,
  ) {
    const limit = query.limit ?? DEFAULT_LIST_LIMIT;
    const before = this.parseBeforeDate(query.before);

    const messages = await this.prisma.chatMessage.findMany({
      where: {
        ...where,
        ...(before
          ? {
              createdAt: {
                lt: before,
              },
            }
          : {}),
      },
      select: chatMessageSelect,
      orderBy: [{ createdAt: 'desc' }],
      take: limit + 1,
    });

    const hasMore = messages.length > limit;
    const limited = hasMore ? messages.slice(0, limit) : messages;
    const items = limited.reverse().map((item) => this.mapMessage(item));

    return {
      items,
      limit,
      hasMore,
      nextBefore: hasMore && limited.length > 0 ? limited[limited.length - 1].createdAt : null,
    };
  }

  private async findMessageOrThrow(organizationId: string, messageId: string) {
    const message = await this.prisma.chatMessage.findFirst({
      where: {
        id: messageId,
        organizationId,
      },
      select: chatMessageSelect,
    });

    if (!message) {
      throw new NotFoundException('Сообщение чата не найдено');
    }

    return message;
  }

  private async ensureCanEditOrDelete(
    message: ChatMessageRecord,
    actorUserId: string,
  ) {
    if (message.sender.id === actorUserId) {
      return;
    }

    const membership = await this.prisma.membership.findFirst({
      where: {
        organizationId: message.organizationId,
        userId: actorUserId,
        status: MembershipStatus.ACTIVE,
      },
      select: {
        role: true,
      },
    });

    if (!membership || !moderatorRoles.has(membership.role)) {
      throw new ForbiddenException('У вас нет прав редактировать или удалять это сообщение');
    }
  }

  private async ensureOrganizationExists(organizationId: string) {
    const organization = await this.prisma.organization.findFirst({
      where: {
        id: organizationId,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (!organization) {
      throw new NotFoundException('Организация не найдена');
    }
  }

  private async ensureEventExists(organizationId: string, eventId: string) {
    const event = await this.prisma.event.findFirst({
      where: {
        id: eventId,
        organizationId,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (!event) {
      throw new NotFoundException('Событие не найдено');
    }
  }

  private async ensureMessageCanBeModified(message: ChatMessageRecord) {
    if (message.deletedAt) {
      throw new BadRequestException('Сообщение уже удалено');
    }
  }

  private emitMessageUpdated(payload: ReturnType<ChatsService['mapMessage']>) {
    if (payload.scope === ChatScope.EVENT && payload.eventId) {
      this.gateway.emitToEventChat(payload.eventId, 'chat:message:updated', payload);
      this.gateway.emitToOrganizationChat(
        payload.organizationId,
        'chat:message:updated',
        payload,
      );
      return;
    }

    this.gateway.emitToOrganizationChat(
      payload.organizationId,
      'chat:message:updated',
      payload,
    );
  }

  private emitMessageDeleted(payload: ReturnType<ChatsService['mapMessage']>) {
    if (payload.scope === ChatScope.EVENT && payload.eventId) {
      this.gateway.emitToEventChat(payload.eventId, 'chat:message:deleted', payload);
      this.gateway.emitToOrganizationChat(
        payload.organizationId,
        'chat:message:deleted',
        payload,
      );
      return;
    }

    this.gateway.emitToOrganizationChat(
      payload.organizationId,
      'chat:message:deleted',
      payload,
    );
  }

  private mapMessage(message: ChatMessageRecord) {
    return {
      id: message.id,
      organizationId: message.organizationId,
      eventId: message.eventId,
      scope: message.scope,
      body: this.decryptMessageBody(message),
      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
      editedAt: message.editedAt,
      deletedAt: message.deletedAt,
      sender: {
        userId: message.sender.id,
        firstName: message.sender.firstName,
        lastName: message.sender.lastName,
        avatarUrl: message.sender.avatarUrl,
      },
    };
  }

  private parseBeforeDate(value?: string): Date | null {
    if (!value) {
      return null;
    }

    const parsed = new Date(value);

    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('Некорректный параметр before');
    }

    return parsed;
  }

  private normalizeMessageBody(value: string): string {
    const normalized = value.trim();

    if (normalized.length < 1) {
      throw new BadRequestException('Текст сообщения обязателен');
    }

    if (normalized.length > 4000) {
      throw new BadRequestException('Текст сообщения слишком длинный');
    }

    return normalized;
  }

  private encryptMessageBody(
    value: string,
    organizationId: string,
    scope: ChatScope,
    eventId: string | null,
  ): string {
    return this.dataEncryptionService.encrypt(
      value,
      this.buildMessageAad(organizationId, scope, eventId),
    );
  }

  private decryptMessageBody(message: {
    organizationId: string;
    scope: ChatScope;
    eventId: string | null;
    body: string;
  }): string {
    return this.dataEncryptionService.decrypt(
      message.body,
      this.buildMessageAad(message.organizationId, message.scope, message.eventId),
    );
  }

  private buildMessageAad(
    organizationId: string,
    scope: ChatScope,
    eventId: string | null,
  ): string {
    return `chat:${organizationId}:${scope}:${eventId ?? 'organization'}`;
  }

  private toAuditPayload(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }
}
