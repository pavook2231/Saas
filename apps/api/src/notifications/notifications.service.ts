import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditTargetType,
  EventAttendanceStatus,
  EventStatus,
  NotificationChannel,
  NotificationDeliveryStatus,
  NotificationType,
  Prisma,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { DataEncryptionService } from '../security/services/data-encryption.service';

import { ListMyNotificationsQueryDto } from './dto/list-my-notifications-query.dto';
import { RegisterPushDeviceDto } from './dto/register-push-device.dto';
import { RegisterWebPushSubscriptionDto } from './dto/register-web-push-subscription.dto';
import { UnregisterPushDeviceDto } from './dto/unregister-push-device.dto';
import { UnregisterWebPushSubscriptionDto } from './dto/unregister-web-push-subscription.dto';
import { NotificationsGateway } from './notifications.gateway';
import { FirebasePushService } from './services/firebase-push.service';
import { WebPushService } from './services/web-push.service';

type NotifyUsersInput = {
  organizationId?: string;
  eventId?: string;
  actorUserId?: string;
  dedupeKey?: string;
  type: NotificationType;
  title: string;
  body: string;
  payload?: Record<string, unknown>;
  userIds: string[];
};

const DEFAULT_EVENT_TIMEZONE = 'Europe/Moscow';

type EventReminderDispatchResult = {
  processed: number;
  sent: number;
  skipped: number;
  failed: number;
};

type ReminderPreferencesResponse = {
  enabled: boolean;
};

const scheduleChangeNotificationTypes: NotificationType[] = [
  NotificationType.EVENT_ASSIGNED,
  NotificationType.EVENT_UPDATED,
  NotificationType.EVENT_URGENT_CHANGE,
];

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: NotificationsGateway,
    private readonly firebasePushService: FirebasePushService,
    private readonly webPushService: WebPushService,
    private readonly dataEncryptionService: DataEncryptionService,
  ) {}

  async getReminderPreferences(userId: string): Promise<ReminderPreferencesResponse> {
    const user = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        eventRemindersEnabled: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }

    return {
      enabled: user.eventRemindersEnabled,
    };
  }

  async updateReminderPreferences(
    userId: string,
    enabled: boolean,
  ): Promise<ReminderPreferencesResponse> {
    const user = await this.prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        eventRemindersEnabled: enabled,
      },
      select: {
        eventRemindersEnabled: true,
      },
    });

    return {
      enabled: user.eventRemindersEnabled,
    };
  }

  async registerPushDevice(userId: string, dto: RegisterPushDeviceDto) {
    const token = dto.token.trim();
    const tokenHash = this.dataEncryptionService.hashDeterministic(token);

    if (token.length < 20) {
      throw new BadRequestException('Некорректный push-токен');
    }

    const device = await this.prisma.pushDeviceToken.upsert({
      where: {
        tokenHash,
      },
      update: {
        userId,
        token: this.dataEncryptionService.encrypt(token, `push:${userId}`),
        platform: this.trimOrNull(dto.platform),
        deviceId: this.trimOrNull(dto.deviceId),
        isActive: true,
        lastSeenAt: new Date(),
      },
      create: {
        userId,
        token: this.dataEncryptionService.encrypt(token, `push:${userId}`),
        tokenHash,
        platform: this.trimOrNull(dto.platform),
        deviceId: this.trimOrNull(dto.deviceId),
        isActive: true,
        lastSeenAt: new Date(),
      },
      select: {
        id: true,
        provider: true,
        platform: true,
        deviceId: true,
        isActive: true,
        lastSeenAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      ...device,
      tokenFingerprint: this.dataEncryptionService.maskValue(token),
    };
  }

  async unregisterPushDevice(userId: string, dto: UnregisterPushDeviceDto) {
    const token = dto.token.trim();
    const tokenHash = this.dataEncryptionService.hashDeterministic(token);

    const updated = await this.prisma.pushDeviceToken.updateMany({
      where: {
        userId,
        tokenHash,
        isActive: true,
      },
      data: {
        isActive: false,
      },
    });

    return {
      success: true as const,
      disabledCount: updated.count,
    };
  }

  getWebPushClientConfig() {
    return {
      enabled: this.webPushService.isEnabled(),
      publicKey: this.webPushService.getPublicKey(),
    };
  }

  async listMyWebPushSubscriptions(userId: string) {
    const items = await this.prisma.webPushSubscription.findMany({
      where: {
        userId,
      },
      select: {
        id: true,
        endpoint: true,
        userAgent: true,
        deviceLabel: true,
        isActive: true,
        lastSeenAt: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ updatedAt: 'desc' }],
    });

    return items.map((item) => ({
      id: item.id,
      endpointFingerprint: this.dataEncryptionService.maskValue(
        this.dataEncryptionService.decrypt(item.endpoint, `web-push:${userId}`),
      ),
      userAgent: item.userAgent,
      deviceLabel: item.deviceLabel,
      isActive: item.isActive,
      lastSeenAt: item.lastSeenAt,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }));
  }

  async registerWebPushSubscription(
    userId: string,
    dto: RegisterWebPushSubscriptionDto,
  ) {
    const endpoint = dto.endpoint.trim();
    const endpointHash = this.dataEncryptionService.hashDeterministic(endpoint);
    const clientDeviceId = this.trimOrNull(dto.clientDeviceId);

    if (clientDeviceId) {
      await this.prisma.webPushSubscription.updateMany({
        where: {
          userId,
          clientDeviceId,
          endpointHash: {
            not: endpointHash,
          },
          isActive: true,
        },
        data: {
          isActive: false,
        },
      });
    }

    const subscription = await this.prisma.webPushSubscription.upsert({
      where: {
        endpointHash,
      },
      update: {
        userId,
        endpoint: this.dataEncryptionService.encrypt(endpoint, `web-push:${userId}`),
        p256dh: this.dataEncryptionService.encrypt(dto.keys.p256dh, `web-push:${userId}`),
        auth: this.dataEncryptionService.encrypt(dto.keys.auth, `web-push:${userId}`),
        userAgent: this.trimOrNull(dto.userAgent),
        deviceLabel: this.trimOrNull(dto.deviceLabel),
        clientDeviceId,
        isActive: true,
        lastSeenAt: new Date(),
      },
      create: {
        userId,
        endpoint: this.dataEncryptionService.encrypt(endpoint, `web-push:${userId}`),
        endpointHash,
        p256dh: this.dataEncryptionService.encrypt(dto.keys.p256dh, `web-push:${userId}`),
        auth: this.dataEncryptionService.encrypt(dto.keys.auth, `web-push:${userId}`),
        userAgent: this.trimOrNull(dto.userAgent),
        deviceLabel: this.trimOrNull(dto.deviceLabel),
        clientDeviceId,
        isActive: true,
        lastSeenAt: new Date(),
      },
      select: {
        id: true,
        userAgent: true,
        deviceLabel: true,
        isActive: true,
        lastSeenAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      ...subscription,
      endpointFingerprint: this.dataEncryptionService.maskValue(endpoint),
    };
  }

  async unregisterWebPushSubscription(
    userId: string,
    dto: UnregisterWebPushSubscriptionDto,
  ) {
    const endpointHash = this.dataEncryptionService.hashDeterministic(dto.endpoint.trim());
    const clientDeviceId = this.trimOrNull(dto.clientDeviceId);

    const updated = await this.prisma.webPushSubscription.updateMany({
      where: {
        userId,
        isActive: true,
        OR: [
          {
            endpointHash,
          },
          ...(clientDeviceId
            ? [
                {
                  clientDeviceId,
                },
              ]
            : []),
        ],
      },
      data: {
        isActive: false,
      },
    });

    return {
      success: true as const,
      disabledCount: updated.count,
    };
  }

  async listMyNotifications(userId: string, query: ListMyNotificationsQueryDto) {
    const limit = query.limit ?? 50;

    const where: Prisma.NotificationRecipientWhereInput = {
      userId,
      channel: NotificationChannel.WEB,
      ...(query.unreadOnly ? { status: { not: NotificationDeliveryStatus.READ } } : {}),
    };

    const [items, unreadCount] = await Promise.all([
      this.prisma.notificationRecipient.findMany({
        where,
        select: {
          id: true,
          status: true,
          deliveredAt: true,
          readAt: true,
          createdAt: true,
          notification: {
            select: {
              id: true,
              organizationId: true,
              eventId: true,
              actorUserId: true,
              type: true,
              title: true,
              body: true,
              payload: true,
              createdAt: true,
            },
          },
        },
        orderBy: [{ createdAt: 'desc' }],
        take: limit,
      }),
      this.prisma.notificationRecipient.count({
        where: {
          userId,
          channel: NotificationChannel.WEB,
          status: {
            not: NotificationDeliveryStatus.READ,
          },
        },
      }),
    ]);

    return {
      unreadCount,
      items: items.map((item) => ({
        recipientId: item.id,
        status: item.status,
        deliveredAt: item.deliveredAt,
        readAt: item.readAt,
        createdAt: item.createdAt,
        notification: item.notification,
      })),
    };
  }

  async listMyScheduleChanges(userId: string, limit: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { scheduleChangesSeenAt: true },
    });

    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }

    const seenAt = user.scheduleChangesSeenAt;
    const where: Prisma.NotificationRecipientWhereInput = {
      userId,
      channel: NotificationChannel.WEB,
      notification: {
        type: {
          in: scheduleChangeNotificationTypes,
        },
        ...(seenAt ? { createdAt: { gt: seenAt } } : {}),
      },
    };

    const items = await this.prisma.notificationRecipient.findMany({
      where,
      select: {
        id: true,
        status: true,
        deliveredAt: true,
        readAt: true,
        createdAt: true,
        notification: {
          select: {
            id: true,
            organizationId: true,
            eventId: true,
            actorUserId: true,
            type: true,
            title: true,
            body: true,
            payload: true,
            createdAt: true,
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }],
      take: limit,
    });

    return {
      seenAt,
      unreadCount: items.length,
      items: items.map((item) => ({
        recipientId: item.id,
        status: item.status,
        deliveredAt: item.deliveredAt,
        readAt: item.readAt,
        createdAt: item.createdAt,
        notification: item.notification,
      })),
    };
  }

  async markScheduleChangesSeen(userId: string) {
    const now = new Date();
    await this.prisma.user.update({
      where: { id: userId },
      data: { scheduleChangesSeenAt: now },
    });

    return {
      success: true as const,
      seenAt: now,
    };
  }

  async markAsRead(userId: string, recipientId: string) {
    const recipient = await this.prisma.notificationRecipient.findFirst({
      where: {
        id: recipientId,
        userId,
        channel: NotificationChannel.WEB,
      },
      select: {
        id: true,
        status: true,
        readAt: true,
      },
    });

    if (!recipient) {
      throw new NotFoundException('Получатель уведомления не найден');
    }

    if (recipient.status === NotificationDeliveryStatus.READ) {
      return {
        success: true as const,
        alreadyRead: true as const,
      };
    }

    await this.prisma.notificationRecipient.update({
      where: {
        id: recipient.id,
      },
      data: {
        status: NotificationDeliveryStatus.READ,
        readAt: new Date(),
      },
    });

    return {
      success: true as const,
    };
  }

  async notifyEventParticipants(input: {
    organizationId: string;
    eventId: string;
    type: NotificationType;
    title: string;
    body: string;
    actorUserId?: string;
    payload?: Record<string, unknown>;
  }) {
    const assignments = await this.prisma.eventParticipant.findMany({
      where: {
        eventId: input.eventId,
        event: {
          organizationId: input.organizationId,
          deletedAt: null,
        },
        participant: {
          deletedAt: null,
          userId: {
            not: null,
          },
        },
      },
      select: {
        participant: {
          select: {
            userId: true,
          },
        },
      },
    });

    const userIds = assignments
      .map((assignment) => assignment.participant.userId)
      .filter((userId): userId is string => typeof userId === 'string');

    return this.notifyUsers({
      organizationId: input.organizationId,
      eventId: input.eventId,
      actorUserId: input.actorUserId,
      type: input.type,
      title: input.title,
      body: input.body,
      payload: input.payload,
      userIds,
    });
  }

  async notifyUsers(input: NotifyUsersInput) {
    const requestedUserIds = this.deduplicateIds(input.userIds).filter(
      (userId) => userId !== input.actorUserId,
    );

    if (requestedUserIds.length === 0) {
      return {
        notificationId: null,
        usersCount: 0,
        pushUsersCount: 0,
      };
    }

    const activeUsers = await this.prisma.user.findMany({
      where: {
        id: {
          in: requestedUserIds,
        },
        isActive: true,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });
    const uniqueUserIds = activeUsers.map((user) => user.id);

    if (uniqueUserIds.length === 0) {
      return {
        notificationId: null,
        usersCount: 0,
        pushUsersCount: 0,
      };
    }

    const now = new Date();

    if (input.dedupeKey) {
      const existing = await this.prisma.notification.findUnique({
        where: {
          dedupeKey: input.dedupeKey,
        },
        select: {
          id: true,
          createdAt: true,
        },
      });

      if (existing) {
        return {
          notificationId: existing.id,
          usersCount: uniqueUserIds.length,
          pushUsersCount: 0,
          deduplicated: true as const,
        };
      }
    }

    const notification = await this.prisma.$transaction(async (tx) => {
      const created = await tx.notification.create({
        data: {
          organizationId: input.organizationId,
          eventId: input.eventId,
          actorUserId: input.actorUserId,
          dedupeKey: input.dedupeKey,
          type: input.type,
          title: input.title,
          body: input.body,
          payload: input.payload ? this.toAuditPayload(input.payload) : undefined,
        },
        select: {
          id: true,
          organizationId: true,
          eventId: true,
          actorUserId: true,
          type: true,
          title: true,
          body: true,
          payload: true,
          createdAt: true,
        },
      });

      await tx.notificationRecipient.createMany({
        data: uniqueUserIds.map((userId) => ({
          notificationId: created.id,
          userId,
          channel: NotificationChannel.WEB,
          status: NotificationDeliveryStatus.SENT,
          deliveredAt: now,
        })),
      });

      await tx.notificationRecipient.createMany({
        data: uniqueUserIds.map((userId) => ({
          notificationId: created.id,
          userId,
          channel: NotificationChannel.PUSH,
          status: NotificationDeliveryStatus.PENDING,
        })),
      });

      await tx.auditLog.create({
        data: {
          organizationId: input.organizationId,
          actorUserId: input.actorUserId,
          targetType: AuditTargetType.NOTIFICATION,
          targetId: created.id,
          action: 'notification.created',
          description: 'Notification created',
          payload: this.toAuditPayload({
            type: created.type,
            recipients: uniqueUserIds.length,
            eventId: created.eventId,
          }),
        },
      });

      return created;
    });

    this.gateway.emitToUsers(uniqueUserIds, 'notifications:new', {
      recipientChannel: NotificationChannel.WEB,
      notification,
    });

    const pushUrl = this.resolvePushUrl(input);

    await this.deliverPushForNotification(notification.id, uniqueUserIds, {
      title: notification.title,
      body: notification.body,
      data: {
        notificationId: notification.id,
        type: notification.type,
        organizationId: notification.organizationId ?? '',
        eventId: notification.eventId ?? '',
        url: pushUrl,
      },
    });

    return {
      notificationId: notification.id,
      usersCount: uniqueUserIds.length,
      pushUsersCount: uniqueUserIds.length,
    };
  }

  async dispatchDueEventReminders(
    offsetMinutes: number,
    windowMinutes = 2,
  ): Promise<EventReminderDispatchResult> {
    const now = new Date();
    const upperBound = new Date(now.getTime() + offsetMinutes * 60_000);
    const lowerBound = new Date(upperBound.getTime() - windowMinutes * 60_000);

    const events = await this.prisma.event.findMany({
      where: {
        deletedAt: null,
        status: {
          in: [EventStatus.PLANNED, EventStatus.CONFIRMED],
        },
        startsAt: {
          gt: lowerBound,
          lte: upperBound,
        },
      },
      select: {
        id: true,
        organizationId: true,
        title: true,
        startsAt: true,
        timezone: true,
        participants: {
          where: {
            attendanceStatus: {
              notIn: [EventAttendanceStatus.DECLINED, EventAttendanceStatus.ABSENT],
            },
            participant: {
              userId: {
                not: null,
              },
              deletedAt: null,
            },
          },
          select: {
            participant: {
              select: {
                userId: true,
              },
            },
          },
        },
      },
    });

    const result: EventReminderDispatchResult = {
      processed: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
    };

    for (const event of events) {
      const reminderAt = new Date(event.startsAt.getTime() - offsetMinutes * 60_000);

      if (reminderAt < lowerBound || reminderAt > now) {
        continue;
      }

      result.processed += 1;
      const reminderKey = `${offsetMinutes}m`;

      const existingDispatch = await this.prisma.eventReminderDispatch.findUnique({
        where: {
          eventId_reminderKey: {
            eventId: event.id,
            reminderKey,
          },
        },
        select: {
          id: true,
          status: true,
        },
      });

      if (existingDispatch?.status === NotificationDeliveryStatus.SENT) {
        result.skipped += 1;
        continue;
      }

      const dispatch = existingDispatch
        ? await this.prisma.eventReminderDispatch.update({
            where: {
              id: existingDispatch.id,
            },
            data: {
              reminderAt,
              status: NotificationDeliveryStatus.PENDING,
              errorMessage: null,
              sentAt: null,
            },
            select: {
              id: true,
            },
          })
        : await this.prisma.eventReminderDispatch.create({
            data: {
              eventId: event.id,
              reminderKey,
              reminderAt,
              status: NotificationDeliveryStatus.PENDING,
            },
            select: {
              id: true,
            },
          });

      const userIds = this.deduplicateIds(
        event.participants
          .map((participant) => participant.participant.userId)
          .filter((userId): userId is string => Boolean(userId)),
      );

      try {
        await this.notifyUsers({
          organizationId: event.organizationId,
          eventId: event.id,
          type: NotificationType.EVENT_REMINDER,
          title: `Reminder: ${event.title}`,
          body: `Событие начнётся ${this.formatReminderDateTime(event.startsAt, this.resolveEventTimezone(event.timezone))}.`,
          payload: {
            eventId: event.id,
            eventTitle: event.title,
            startsAt: event.startsAt.toISOString(),
            reminderOffsetMinutes: offsetMinutes,
          },
          userIds,
        });

        await this.prisma.eventReminderDispatch.update({
          where: {
            id: dispatch.id,
          },
          data: {
            status: NotificationDeliveryStatus.SENT,
            sentAt: new Date(),
          },
        });

        result.sent += 1;
      } catch (error) {
        await this.prisma.eventReminderDispatch.update({
          where: {
            id: dispatch.id,
          },
          data: {
            status: NotificationDeliveryStatus.FAILED,
            errorMessage: (error as Error).message.slice(0, 1000),
          },
        });

        result.failed += 1;
      }
    }

    return result;
  }

  async dispatchNextDayEventRemindersAtHour(
    reminderHourLocal = 20,
    windowMinutes = 2,
  ): Promise<EventReminderDispatchResult> {
    const now = new Date();
    const lowerBound = new Date(now.getTime() - windowMinutes * 60_000);
    const upperBound = new Date(now.getTime() + 36 * 60 * 60_000);

    const events = await this.prisma.event.findMany({
      where: {
        deletedAt: null,
        status: {
          in: [EventStatus.PLANNED, EventStatus.CONFIRMED],
        },
        startsAt: {
          gt: now,
          lte: upperBound,
        },
        participants: {
          some: {
            attendanceStatus: {
              notIn: [EventAttendanceStatus.DECLINED, EventAttendanceStatus.ABSENT],
            },
            participant: {
              userId: {
                not: null,
              },
              deletedAt: null,
            },
          },
        },
      },
      select: {
        id: true,
        organizationId: true,
        title: true,
        startsAt: true,
        timezone: true,
        participants: {
          where: {
            attendanceStatus: {
              notIn: [EventAttendanceStatus.DECLINED, EventAttendanceStatus.ABSENT],
            },
            participant: {
              deletedAt: null,
              userId: {
                not: null,
              },
              user: {
                isActive: true,
                deletedAt: null,
                eventRemindersEnabled: true,
              },
            },
          },
          select: {
            participant: {
              select: {
                userId: true,
              },
            },
          },
        },
      },
    });

    const result: EventReminderDispatchResult = {
      processed: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
    };

    for (const event of events) {
      const timezone = this.resolveEventTimezone(event.timezone);
      const reminderAt = this.resolveDayBeforeReminderAt(event.startsAt, timezone, reminderHourLocal);

      if (reminderAt < lowerBound || reminderAt > now) {
        continue;
      }

      result.processed += 1;

      const existingDispatch = await this.prisma.eventReminderDispatch.findUnique({
        where: {
          eventId_reminderKey: {
            eventId: event.id,
            reminderKey: 'day-before-20:00',
          },
        },
        select: {
          id: true,
          status: true,
        },
      });

      if (existingDispatch?.status === NotificationDeliveryStatus.SENT) {
        result.skipped += 1;
        continue;
      }

      const dispatch = existingDispatch
        ? await this.prisma.eventReminderDispatch.update({
            where: {
              id: existingDispatch.id,
            },
            data: {
              reminderAt,
              status: NotificationDeliveryStatus.PENDING,
              errorMessage: null,
              sentAt: null,
            },
            select: {
              id: true,
            },
          })
        : await this.prisma.eventReminderDispatch.create({
            data: {
              eventId: event.id,
              reminderKey: 'day-before-20:00',
              reminderAt,
              status: NotificationDeliveryStatus.PENDING,
            },
            select: {
              id: true,
            },
          });

      const userIds = this.deduplicateIds(
        event.participants
          .map((participant) => participant.participant.userId)
          .filter((userId): userId is string => Boolean(userId)),
      );

      if (userIds.length === 0) {
        await this.prisma.eventReminderDispatch.update({
          where: {
            id: dispatch.id,
          },
          data: {
            status: NotificationDeliveryStatus.FAILED,
            errorMessage: 'No recipients with reminders enabled',
          },
        });
        result.failed += 1;
        continue;
      }

      try {
        await this.notifyUsers({
          organizationId: event.organizationId,
          eventId: event.id,
          type: NotificationType.EVENT_REMINDER,
          title: `Напоминание: ${event.title}`,
          body: `Завтра, ${this.formatReminderDateTime(event.startsAt, timezone)}`,
          payload: {
            eventId: event.id,
            eventTitle: event.title,
            startsAt: event.startsAt.toISOString(),
            url: `/calendar?eventId=${event.id}`,
            reminderType: 'day_before_20_local',
          },
          userIds,
        });

        await this.prisma.eventReminderDispatch.update({
          where: {
            id: dispatch.id,
          },
          data: {
            status: NotificationDeliveryStatus.SENT,
            sentAt: new Date(),
          },
        });

        result.sent += 1;
      } catch (error) {
        await this.prisma.eventReminderDispatch.update({
          where: {
            id: dispatch.id,
          },
          data: {
            status: NotificationDeliveryStatus.FAILED,
            errorMessage: (error as Error).message.slice(0, 1000),
          },
        });
        result.failed += 1;
      }
    }

    return result;
  }

  private async deliverPushForNotification(
    notificationId: string,
    userIds: string[],
    message: {
      title: string;
      body: string;
      data: Record<string, string>;
    },
  ) {
    if (userIds.length === 0) {
      return;
    }

    const pushTokens = await this.prisma.pushDeviceToken.findMany({
      where: {
        userId: {
          in: userIds,
        },
        isActive: true,
      },
      select: {
        id: true,
        userId: true,
        token: true,
        tokenHash: true,
      },
    });

    const webPushSubscriptions = await this.prisma.webPushSubscription.findMany({
      where: {
        userId: {
          in: userIds,
        },
        isActive: true,
      },
      select: {
        id: true,
        userId: true,
        endpoint: true,
        endpointHash: true,
        p256dh: true,
        auth: true,
      },
    });

    if (
      pushTokens.length === 0 &&
      webPushSubscriptions.length === 0
    ) {
      await this.prisma.notificationRecipient.updateMany({
        where: {
          notificationId,
          channel: NotificationChannel.PUSH,
          userId: {
            in: userIds,
          },
        },
        data: {
          status: NotificationDeliveryStatus.FAILED,
          errorMessage: 'No active push tokens',
        },
      });

      return;
    }

    const successByUser = new Map<string, boolean>();
    const invalidTokens = new Set<string>();
    const invalidWebPushEndpoints = new Set<string>();

    if (pushTokens.length > 0 && this.firebasePushService.isEnabled()) {
      const decryptedTokens = pushTokens.map((item) => ({
        ...item,
        plainToken: this.dataEncryptionService.decrypt(item.token, `push:${item.userId}`),
      }));
      const tokenToRecord = new Map(
        decryptedTokens.map((item) => [
          item.plainToken,
          { userId: item.userId, tokenHash: item.tokenHash },
        ]),
      );
      const tokenResults = await this.firebasePushService.sendToTokens({
        tokens: decryptedTokens.map((item) => item.plainToken),
        title: message.title,
        body: message.body,
        data: message.data,
      });

      for (const result of tokenResults) {
        const tokenRecord = tokenToRecord.get(result.token);
        const userId = tokenRecord?.userId;

        if (!userId) {
          continue;
        }

        const hasSuccess = successByUser.get(userId) ?? false;
        successByUser.set(userId, hasSuccess || result.success);

        if (!result.success && this.isInvalidTokenError(result.errorCode)) {
          if (tokenRecord?.tokenHash) {
            invalidTokens.add(tokenRecord.tokenHash);
          }
        }
      }
    }

    if (webPushSubscriptions.length > 0 && this.webPushService.isEnabled()) {
      const decryptedSubscriptions = webPushSubscriptions.map((item) => ({
        ...item,
        plainEndpoint: this.dataEncryptionService.decrypt(
          item.endpoint,
          `web-push:${item.userId}`,
        ),
        plainP256dh: this.dataEncryptionService.decrypt(
          item.p256dh,
          `web-push:${item.userId}`,
        ),
        plainAuth: this.dataEncryptionService.decrypt(item.auth, `web-push:${item.userId}`),
      }));
      const endpointToRecord = new Map(
        decryptedSubscriptions.map((item) => [
          item.plainEndpoint,
          { userId: item.userId, endpointHash: item.endpointHash },
        ]),
      );
      const webPushResults = await this.webPushService.sendToSubscriptions({
        subscriptions: decryptedSubscriptions.map((item) => ({
          endpoint: item.plainEndpoint,
          p256dh: item.plainP256dh,
          auth: item.plainAuth,
        })),
        title: message.title,
        body: message.body,
        data: message.data,
      });

      for (const result of webPushResults) {
        const subscriptionRecord = endpointToRecord.get(result.endpoint);
        const userId = subscriptionRecord?.userId;

        if (!userId) {
          continue;
        }

        const hasSuccess = successByUser.get(userId) ?? false;
        successByUser.set(userId, hasSuccess || result.success);

        if (!result.success && this.isInactiveWebPushError(result.statusCode)) {
          if (subscriptionRecord?.endpointHash) {
            invalidWebPushEndpoints.add(subscriptionRecord.endpointHash);
          }
        }
      }
    }

    if (invalidTokens.size > 0) {
      await this.prisma.pushDeviceToken.updateMany({
        where: {
          tokenHash: {
            in: Array.from(invalidTokens),
          },
        },
        data: {
          isActive: false,
        },
      });
    }

    if (invalidWebPushEndpoints.size > 0) {
      await this.prisma.webPushSubscription.updateMany({
        where: {
          endpointHash: {
            in: Array.from(invalidWebPushEndpoints),
          },
        },
        data: {
          isActive: false,
        },
      });
    }

    const now = new Date();
    const pushProviderEnabled =
      this.firebasePushService.isEnabled() || this.webPushService.isEnabled();

    for (const userId of userIds) {
      const success = successByUser.get(userId) ?? false;

      await this.prisma.notificationRecipient.updateMany({
        where: {
          notificationId,
          channel: NotificationChannel.PUSH,
          userId,
        },
        data: success
          ? {
              status: NotificationDeliveryStatus.SENT,
              deliveredAt: now,
              errorMessage: null,
            }
          : {
              status: NotificationDeliveryStatus.FAILED,
              errorMessage: pushProviderEnabled
                ? 'All push deliveries failed'
                : 'No configured push providers',
            },
      });
    }
  }

  private isInvalidTokenError(code?: string): boolean {
    if (!code) {
      return false;
    }

    return (
      code === 'messaging/registration-token-not-registered' ||
      code === 'messaging/invalid-registration-token'
    );
  }

  private isInactiveWebPushError(statusCode?: number): boolean {
    return statusCode === 404 || statusCode === 410;
  }

  private deduplicateIds(values: string[]): string[] {
    return Array.from(new Set(values));
  }

  private resolveDayBeforeReminderAt(
    startsAt: Date,
    timezone: string,
    reminderHourLocal: number,
  ): Date {
    const eventLocal = this.getTimeZoneParts(startsAt, timezone);
    const previousDay = new Date(Date.UTC(eventLocal.year, eventLocal.month - 1, eventLocal.day, 0, 0, 0, 0));
    previousDay.setUTCDate(previousDay.getUTCDate() - 1);

    return this.createDateInTimeZone(
      timezone,
      previousDay.getUTCFullYear(),
      previousDay.getUTCMonth() + 1,
      previousDay.getUTCDate(),
      reminderHourLocal,
      0,
    );
  }

  private createDateInTimeZone(
    timezone: string,
    year: number,
    month: number,
    day: number,
    hour: number,
    minute: number,
  ): Date {
    let utcDate = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));

    for (let index = 0; index < 3; index += 1) {
      const offsetMinutes = this.getTimeZoneOffsetMinutes(utcDate, timezone);
      const adjusted = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0) - offsetMinutes * 60_000);

      if (adjusted.getTime() === utcDate.getTime()) {
        break;
      }

      utcDate = adjusted;
    }

    return utcDate;
  }

  private getTimeZoneParts(date: Date, timezone: string) {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = formatter.formatToParts(date);
    const read = (type: string) => Number(parts.find((item) => item.type === type)?.value ?? '0');

    return {
      year: read('year'),
      month: read('month'),
      day: read('day'),
      hour: read('hour'),
      minute: read('minute'),
    };
  }

  private getTimeZoneOffsetMinutes(date: Date, timezone: string): number {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'shortOffset',
      hour: '2-digit',
    });
    const offsetToken =
      formatter.formatToParts(date).find((part) => part.type === 'timeZoneName')?.value ?? 'GMT';

    if (offsetToken === 'GMT') {
      return 0;
    }

    const match = offsetToken.match(/^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/);

    if (!match) {
      return 0;
    }

    const sign = match[1] === '-' ? -1 : 1;
    const hours = Number(match[2] ?? '0');
    const minutes = Number(match[3] ?? '0');

    return sign * (hours * 60 + minutes);
  }

  private formatReminderDateTime(date: Date, timezone: string): string {
    return new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: this.resolveEventTimezone(timezone),
    }).format(date);
  }

  private resolveEventTimezone(timezone?: string | null): string {
    const normalized = this.trimOrNull(timezone);
    if (!normalized || normalized.toUpperCase() === 'UTC') {
      return DEFAULT_EVENT_TIMEZONE;
    }

    return normalized;
  }

  private resolvePushUrl(input: NotifyUsersInput): string {
    const payloadUrl =
      input.payload && typeof input.payload.url === 'string'
        ? input.payload.url.trim()
        : '';

    if (payloadUrl.startsWith('/')) {
      return payloadUrl;
    }

    if (input.eventId) {
      return `/calendar?eventId=${input.eventId}`;
    }

    return '/calendar';
  }

  private trimOrNull(value?: string | null): string | null {
    if (!value) {
      return null;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private toAuditPayload(value: unknown): Prisma.InputJsonValue {
    try {
      return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
    } catch {
      throw new InternalServerErrorException('Не удалось сериализовать данные уведомления');
    }
  }
}
