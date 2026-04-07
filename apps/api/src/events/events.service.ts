import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditTargetType,
  AvailabilityStatus,
  EventAttendanceStatus,
  EventStatus,
  EventType,
  MembershipStatus,
  NotificationType,
  ParticipantInviteStatus,
  Prisma,
} from '@prisma/client';
import { createHash, randomBytes } from 'crypto';

import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

import { CheckEventConflictsDto } from './dto/check-event-conflicts.dto';
import { CreateEventDto } from './dto/create-event.dto';
import { CreateParticipantDto } from './dto/create-participant.dto';
import { CreateTemplateDto } from './dto/create-template.dto';
import { EventParticipantInputDto } from './dto/event-participant-input.dto';
import { ListEventsQueryDto } from './dto/list-events-query.dto';
import { ListParticipantsQueryDto } from './dto/list-participants-query.dto';
import { ListTemplatesQueryDto } from './dto/list-templates-query.dto';
import { SetEventParticipantsDto } from './dto/set-event-participants.dto';
import { TemplateRoleInputDto } from './dto/template-role-input.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { UpdateParticipantDto } from './dto/update-participant.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';

const participantSelect = {
  id: true,
  organizationId: true,
  userId: true,
  firstName: true,
  lastName: true,
  middleName: true,
  displayName: true,
  email: true,
  phone: true,
  notes: true,
  invitationStatus: true,
  invitedAt: true,
  linkedAt: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} satisfies Prisma.ParticipantSelect;

const templateSelect = {
  id: true,
  organizationId: true,
  name: true,
  type: true,
  description: true,
  location: true,
  durationMinutes: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  roles: {
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      name: true,
      requiredCount: true,
      sortOrder: true,
      description: true,
      assignments: {
        orderBy: [{ createdAt: 'asc' }],
        select: {
          participantId: true,
          participant: {
            select: participantSelect,
          },
        },
      },
    },
  },
} satisfies Prisma.TemplateSelect;

const eventSelect = {
  id: true,
  organizationId: true,
  templateId: true,
  title: true,
  description: true,
  type: true,
  status: true,
  startsAt: true,
  endsAt: true,
  durationMinutes: true,
  timezone: true,
  location: true,
  isAllDay: true,
  createdAt: true,
  updatedAt: true,
    template: {
      select: {
        id: true,
        name: true,
        type: true,
        location: true,
        durationMinutes: true,
        isActive: true,
      },
  },
  participants: {
    orderBy: [{ createdAt: 'asc' }],
    select: {
      id: true,
      participantId: true,
      templateRoleId: true,
      roleName: true,
      attendanceStatus: true,
      isRequired: true,
      checkInAt: true,
      checkOutAt: true,
      notes: true,
      participant: {
        select: participantSelect,
      },
      templateRole: {
        select: {
          id: true,
          name: true,
          sortOrder: true,
        },
      },
    },
  },
} satisfies Prisma.EventSelect;

type NormalizedTemplateRoleInput = {
  name: string;
  requiredCount: number;
  sortOrder: number;
  description: string | null;
  participantIds: string[];
};

type NormalizedEventParticipantInput = {
  participantId: string;
  templateRoleId: string | null;
  roleName: string | null;
  attendanceStatus: EventAttendanceStatus;
  isRequired: boolean;
  notes: string | null;
};

type ConflictItem = {
  type: 'EVENT' | 'AVAILABILITY';
  relatedId: string;
  startsAt: string;
  endsAt: string;
  status: string;
  title?: string;
  reason?: string | null;
};

type ConflictParticipantEntry = {
  participantId: string;
  participantName: string;
  conflicts: ConflictItem[];
};

type ConflictCheckResult = {
  hasConflicts: boolean;
  conflictsByParticipant: ConflictParticipantEntry[];
  summary: {
    participantsChecked: number;
    conflictedParticipants: number;
    eventConflicts: number;
    availabilityConflicts: number;
  };
  suggestion: {
    recommendedStartsAt: string;
    recommendedEndsAt: string;
  } | null;
};

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async listParticipants(organizationId: string, query: ListParticipantsQueryDto) {
    await this.syncParticipantsFromMemberships(organizationId);

    const where: Prisma.ParticipantWhereInput = {
      organizationId,
      ...(query.includeDeleted ? {} : { deletedAt: null }),
    };

    const search = this.trimOrNull(query.search);

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { middleName: { contains: search, mode: 'insensitive' } },
        { displayName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ];
    }

    return this.prisma.participant.findMany({
      where,
      select: participantSelect,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: query.limit ?? 200,
    });
  }

  async getParticipant(organizationId: string, participantId: string) {
    const participant = await this.prisma.participant.findFirst({
      where: {
        id: participantId,
        organizationId,
      },
      select: participantSelect,
    });

    if (!participant || participant.deletedAt) {
      throw new NotFoundException('Участник не найден');
    }

    return participant;
  }

  async createParticipant(
    organizationId: string,
    actorUserId: string,
    dto: CreateParticipantDto,
  ) {
    const normalized = {
      firstName: this.requireTrimmedText(dto.firstName, 'firstName'),
      lastName: this.requireTrimmedText(dto.lastName, 'lastName'),
      middleName: this.trimOrNull(dto.middleName),
      displayName: this.trimOrNull(dto.displayName),
      email: this.normalizeEmail(dto.email),
      phone: this.trimOrNull(dto.phone),
      notes: this.trimOrNull(dto.notes),
    };

    if (dto.sendInvite && dto.userId) {
      throw new BadRequestException('sendInvite нельзя использовать вместе с userId');
    }

    if (dto.sendInvite && !normalized.email) {
      throw new BadRequestException('Для отправки приглашения участнику нужен email');
    }

    if (dto.userId) {
      await this.ensureUserExists(dto.userId);
      await this.ensureUserCanBeLinked(organizationId, dto.userId);
    }

    const now = new Date();
    const inviteTokenPayload = dto.sendInvite ? this.generateInviteToken() : null;
    const participant = await this.prisma.$transaction(async (tx) => {
      const createdParticipant = await tx.participant.create({
        data: {
          organizationId,
          userId: dto.userId,
          firstName: normalized.firstName,
          lastName: normalized.lastName,
          middleName: normalized.middleName,
          displayName: normalized.displayName,
          email: normalized.email,
          phone: normalized.phone,
          notes: normalized.notes,
          invitationStatus: dto.userId
            ? ParticipantInviteStatus.ACCEPTED
            : dto.sendInvite
              ? ParticipantInviteStatus.PENDING
              : ParticipantInviteStatus.NOT_SENT,
          invitedAt: dto.sendInvite ? now : null,
          linkedAt: dto.userId ? now : null,
          createdByUserId: actorUserId,
        },
        select: participantSelect,
      });

      if (dto.sendInvite && normalized.email) {
        await tx.participantInvite.create({
          data: {
            organizationId,
            participantId: createdParticipant.id,
            invitedByUserId: actorUserId,
            email: normalized.email,
            phone: normalized.phone,
            status: ParticipantInviteStatus.PENDING,
            tokenHash: inviteTokenPayload?.tokenHash ?? this.generateInviteToken().tokenHash,
            expiresAt: this.buildParticipantInviteExpiryDate(now),
          },
        });
      }

      await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId,
          targetType: AuditTargetType.PARTICIPANT,
          targetId: createdParticipant.id,
          action: 'participant.created',
          description: 'Participant created',
          payload: {
            firstName: createdParticipant.firstName,
            lastName: createdParticipant.lastName,
            linkedUserId: createdParticipant.userId,
            inviteCreated: dto.sendInvite === true,
          },
        },
      });

      if (dto.sendInvite) {
        await tx.auditLog.create({
          data: {
            organizationId,
            actorUserId,
            targetType: AuditTargetType.PARTICIPANT,
            targetId: createdParticipant.id,
            action: 'participant.invited',
            description: 'Participant invitation created',
            payload: this.toAuditPayload({
              email: normalized.email,
              expiresAt: this.buildParticipantInviteExpiryDate(now).toISOString(),
            }),
          },
        });
      }

      return createdParticipant;
    });

    return {
      ...participant,
      inviteToken: inviteTokenPayload?.rawToken ?? null,
    };
  }

  async updateParticipant(
    organizationId: string,
    participantId: string,
    actorUserId: string,
    dto: UpdateParticipantDto,
  ) {
    const existing = await this.prisma.participant.findFirst({
      where: {
        id: participantId,
        organizationId,
        deletedAt: null,
      },
      select: {
        id: true,
        userId: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('Участник не найден');
    }

    if (dto.unlinkUser && dto.userId) {
      throw new BadRequestException('Нельзя одновременно использовать userId и unlinkUser');
    }

    if (dto.userId) {
      await this.ensureUserExists(dto.userId);
      await this.ensureUserCanBeLinked(organizationId, dto.userId, existing.id);
    }

    const data: Prisma.ParticipantUncheckedUpdateInput = {
      firstName:
        dto.firstName !== undefined
          ? this.requireTrimmedText(dto.firstName, 'firstName')
          : undefined,
      lastName:
        dto.lastName !== undefined
          ? this.requireTrimmedText(dto.lastName, 'lastName')
          : undefined,
      middleName: dto.middleName !== undefined ? this.trimOrNull(dto.middleName) : undefined,
      displayName:
        dto.displayName !== undefined ? this.trimOrNull(dto.displayName) : undefined,
      email: dto.email !== undefined ? this.normalizeEmail(dto.email) : undefined,
      phone: dto.phone !== undefined ? this.trimOrNull(dto.phone) : undefined,
      notes: dto.notes !== undefined ? this.trimOrNull(dto.notes) : undefined,
      userId: dto.unlinkUser ? null : dto.userId,
      linkedAt: dto.unlinkUser ? null : dto.userId ? new Date() : undefined,
      invitationStatus: dto.unlinkUser
        ? ParticipantInviteStatus.NOT_SENT
        : dto.userId
          ? ParticipantInviteStatus.ACCEPTED
          : undefined,
      invitedAt: dto.unlinkUser ? null : undefined,
    };

    const participant = await this.prisma.participant.update({
      where: {
        id: existing.id,
      },
      data,
      select: participantSelect,
    });

    if (dto.userId) {
      await this.prisma.participantInvite.updateMany({
        where: {
          participantId: participant.id,
          status: ParticipantInviteStatus.PENDING,
        },
        data: {
          status: ParticipantInviteStatus.ACCEPTED,
          acceptedAt: new Date(),
        },
      });
    }

    await this.prisma.auditLog.create({
      data: {
        organizationId,
        actorUserId,
        targetType: AuditTargetType.PARTICIPANT,
        targetId: participant.id,
        action: 'participant.updated',
        description: 'Participant updated',
        payload: this.toAuditPayload(dto),
      },
    });

    return participant;
  }

  async archiveParticipant(
    organizationId: string,
    participantId: string,
    actorUserId: string,
  ) {
    const participant = await this.prisma.participant.findFirst({
      where: {
        id: participantId,
        organizationId,
      },
      select: {
        id: true,
        deletedAt: true,
      },
    });

    if (!participant) {
      throw new NotFoundException('Участник не найден');
    }

    if (participant.deletedAt) {
      return {
        success: true as const,
        alreadyDeleted: true as const,
      };
    }

    const deletedAt = new Date();

    await this.prisma.participant.update({
      where: {
        id: participant.id,
      },
      data: {
        deletedAt,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        organizationId,
        actorUserId,
        targetType: AuditTargetType.PARTICIPANT,
        targetId: participant.id,
        action: 'participant.archived',
        description: 'Participant archived',
      },
    });

    return {
      success: true as const,
      deletedAt: deletedAt.toISOString(),
    };
  }

  async listTemplates(organizationId: string, query: ListTemplatesQueryDto) {
    return this.prisma.template.findMany({
      where: {
        organizationId,
        deletedAt: null,
        type: query.type,
        ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
      },
      select: templateSelect,
      orderBy: [{ createdAt: 'desc' }],
      take: query.limit ?? 200,
    });
  }

  async getTemplate(organizationId: string, templateId: string) {
    const template = await this.prisma.template.findFirst({
      where: {
        id: templateId,
        organizationId,
        deletedAt: null,
      },
      select: templateSelect,
    });

    if (!template) {
      throw new NotFoundException('Шаблон не найден');
    }

    return template;
  }

  async createTemplate(
    organizationId: string,
    actorUserId: string,
    dto: CreateTemplateDto,
  ) {
    const name = this.requireTrimmedText(dto.name, 'name', 2);
    const normalizedRoles = await this.normalizeTemplateRoles(
      organizationId,
      dto.roles ?? [],
    );

    const template = await this.prisma.$transaction(async (tx) => {
        const created = await tx.template.create({
          data: {
            organizationId,
            name,
            type: dto.type ?? EventType.CUSTOM,
            description: this.trimOrNull(dto.description),
            location: this.trimOrNull(dto.location),
            durationMinutes: dto.durationMinutes,
            isActive: dto.isActive ?? true,
            createdByUserId: actorUserId,
        },
        select: {
          id: true,
        },
      });

      await this.replaceTemplateRoles(tx, created.id, normalizedRoles);

      await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId,
          targetType: AuditTargetType.TEMPLATE,
          targetId: created.id,
          action: 'template.created',
          description: 'Template created',
          payload: {
            name,
            type: dto.type ?? EventType.CUSTOM,
          },
        },
      });

      return tx.template.findUniqueOrThrow({
        where: {
          id: created.id,
        },
        select: templateSelect,
      });
    });

    return template;
  }

  async updateTemplate(
    organizationId: string,
    templateId: string,
    actorUserId: string,
    dto: UpdateTemplateDto,
  ) {
    const existing = await this.prisma.template.findFirst({
      where: {
        id: templateId,
        organizationId,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('Шаблон не найден');
    }

    const normalizedRoles =
      dto.roles !== undefined
        ? await this.normalizeTemplateRoles(organizationId, dto.roles)
        : null;
    const name =
      dto.name !== undefined ? this.requireTrimmedText(dto.name, 'name', 2) : undefined;

    return this.prisma.$transaction(async (tx) => {
      await tx.template.update({
        where: {
          id: existing.id,
        },
          data: {
            name,
            type: dto.type,
            description:
              dto.description !== undefined ? this.trimOrNull(dto.description) : undefined,
            location: dto.location !== undefined ? this.trimOrNull(dto.location) : undefined,
            durationMinutes: dto.durationMinutes,
            isActive: dto.isActive,
          },
      });

      if (normalizedRoles) {
        await this.replaceTemplateRoles(tx, existing.id, normalizedRoles);
      }

      await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId,
          targetType: AuditTargetType.TEMPLATE,
          targetId: existing.id,
          action: 'template.updated',
          description: 'Template updated',
          payload: this.toAuditPayload(dto),
        },
      });

      return tx.template.findUniqueOrThrow({
        where: {
          id: existing.id,
        },
        select: templateSelect,
      });
    });
  }

  async archiveTemplate(
    organizationId: string,
    templateId: string,
    actorUserId: string,
  ) {
    const template = await this.prisma.template.findFirst({
      where: {
        id: templateId,
        organizationId,
      },
      select: {
        id: true,
        deletedAt: true,
      },
    });

    if (!template) {
      throw new NotFoundException('Шаблон не найден');
    }

    if (template.deletedAt) {
      return {
        success: true as const,
        alreadyDeleted: true as const,
      };
    }

    const deletedAt = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.template.update({
        where: {
          id: template.id,
        },
        data: {
          deletedAt,
          isActive: false,
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId,
          targetType: AuditTargetType.TEMPLATE,
          targetId: template.id,
          action: 'template.archived',
          description: 'Template archived',
        },
      });
    });

    return {
      success: true as const,
      deletedAt: deletedAt.toISOString(),
    };
  }

  async listEvents(organizationId: string, query: ListEventsQueryDto) {
    const where: Prisma.EventWhereInput = {
      organizationId,
      deletedAt: null,
      type: query.type,
      status: query.status,
      templateId: query.templateId,
      ...(query.participantId
        ? {
            participants: {
              some: {
                participantId: query.participantId,
              },
            },
          }
        : {}),
    };

    const hasFrom = Boolean(query.from);
    const hasTo = Boolean(query.to);

    if (hasFrom || hasTo) {
      const fromDate = hasFrom ? new Date(query.from as string) : null;
      const toDate = hasTo ? new Date(query.to as string) : null;

      where.AND = [
        ...(fromDate
          ? [
              {
                endsAt: {
                  gt: fromDate,
                },
              } satisfies Prisma.EventWhereInput,
            ]
          : []),
        ...(toDate
          ? [
              {
                startsAt: {
                  lt: toDate,
                },
              } satisfies Prisma.EventWhereInput,
            ]
          : []),
      ];
    }

    return this.prisma.event.findMany({
      where,
      select: eventSelect,
      orderBy: [{ startsAt: 'asc' }, { createdAt: 'asc' }],
      take: query.limit ?? 300,
    });
  }

  async getEvent(organizationId: string, eventId: string) {
    const event = await this.prisma.event.findFirst({
      where: {
        id: eventId,
        organizationId,
        deletedAt: null,
      },
      select: eventSelect,
    });

    if (!event) {
      throw new NotFoundException('Событие не найдено');
    }

    return event;
  }

  async createEvent(organizationId: string, actorUserId: string, dto: CreateEventDto) {
    const title = this.requireTrimmedText(dto.title, 'title', 2);
    const range = this.parseDateRange(dto.startsAt, dto.endsAt);

    const templateId = dto.templateId ?? null;
    if (templateId) {
      await this.ensureTemplateExists(organizationId, templateId);
    }

    const participants =
      dto.participants !== undefined
        ? await this.normalizeEventParticipants(organizationId, templateId, dto.participants)
        : templateId
          ? await this.buildParticipantsFromTemplate(organizationId, templateId)
          : [];

    if (participants.length > 0) {
      const conflicts = await this.detectConflicts({
        organizationId,
        startsAt: range.startsAt,
        endsAt: range.endsAt,
        participantIds: participants.map((item) => item.participantId),
      });

      if (conflicts.hasConflicts && !dto.ignoreConflicts) {
        throw new ConflictException({
          message: 'Обнаружены конфликты участников',
          conflicts,
        });
      }
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const event = await tx.event.create({
        data: {
          organizationId,
          templateId,
          title,
          description: this.trimOrNull(dto.description),
          type: dto.type ?? EventType.EVENT,
          status: dto.status ?? EventStatus.PLANNED,
          startsAt: range.startsAt,
          endsAt: range.endsAt,
          durationMinutes: range.durationMinutes,
          timezone: this.trimOrNull(dto.timezone) ?? 'UTC',
          location: this.trimOrNull(dto.location),
          isAllDay: dto.isAllDay ?? false,
          createdByUserId: actorUserId,
          updatedByUserId: actorUserId,
        },
        select: {
          id: true,
          title: true,
        },
      });

      if (participants.length > 0) {
        await tx.eventParticipant.createMany({
          data: participants.map((participant) => ({
            eventId: event.id,
            participantId: participant.participantId,
            templateRoleId: participant.templateRoleId,
            roleName: participant.roleName,
            attendanceStatus: participant.attendanceStatus,
            isRequired: participant.isRequired,
            notes: participant.notes,
          })),
        });
      }

      await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId,
          targetType: AuditTargetType.EVENT,
          targetId: event.id,
          action: 'event.created',
          description: 'Event created',
        payload: {
            title: event.title,
            participantsCount: participants.length,
          },
        },
      });

      return event.id;
    });

    const createdEvent = await this.getEvent(organizationId, created);

    await this.notifyEventParticipantsSafe({
      organizationId,
      eventId: createdEvent.id,
      actorUserId,
      type: NotificationType.EVENT_ASSIGNED,
      title: `You were added to "${createdEvent.title}"`,
      body: `Event starts at ${createdEvent.startsAt.toISOString()}`,
      payload: {
        eventId: createdEvent.id,
        eventTitle: createdEvent.title,
        startsAt: createdEvent.startsAt.toISOString(),
        type: createdEvent.type,
      },
    });

    return createdEvent;
  }

  async updateEvent(
    organizationId: string,
    eventId: string,
    actorUserId: string,
    dto: UpdateEventDto,
  ) {
    const existing = await this.prisma.event.findFirst({
      where: {
        id: eventId,
        organizationId,
        deletedAt: null,
      },
      select: {
        id: true,
        templateId: true,
        startsAt: true,
        endsAt: true,
        participants: {
          select: {
            participantId: true,
          },
        },
      },
    });

    if (!existing) {
      throw new NotFoundException('Событие не найдено');
    }

    const range = this.parseDateRange(
      dto.startsAt ?? existing.startsAt.toISOString(),
      dto.endsAt ?? existing.endsAt.toISOString(),
    );

    const title =
      dto.title !== undefined ? this.requireTrimmedText(dto.title, 'title', 2) : undefined;
    const templateId =
      dto.templateId !== undefined ? dto.templateId : existing.templateId;

    if (dto.templateId !== undefined && templateId !== null) {
      await this.ensureTemplateExists(organizationId, templateId);
    }

    const participantsPayload =
      dto.participants !== undefined
        ? await this.normalizeEventParticipants(organizationId, templateId, dto.participants)
        : dto.templateId !== undefined && dto.templateId !== existing.templateId
          ? await this.buildParticipantsFromTemplate(organizationId, templateId)
          : null;

    const participantIdsToCheck =
      participantsPayload?.map((item) => item.participantId) ??
      existing.participants.map((participant) => participant.participantId);

    if (participantIdsToCheck.length > 0) {
      const conflicts = await this.detectConflicts({
        organizationId,
        startsAt: range.startsAt,
        endsAt: range.endsAt,
        participantIds: participantIdsToCheck,
        excludeEventId: existing.id,
      });

      if (conflicts.hasConflicts && !dto.ignoreConflicts) {
        throw new ConflictException({
          message: 'Обнаружены конфликты участников',
          conflicts,
        });
      }
    }

    const startsAtChanged =
      dto.startsAt !== undefined &&
      range.startsAt.getTime() !== existing.startsAt.getTime();

    await this.prisma.$transaction(async (tx) => {
      await tx.event.update({
        where: {
          id: existing.id,
        },
        data: {
          templateId,
          title,
          description:
            dto.description !== undefined ? this.trimOrNull(dto.description) : undefined,
          type: dto.type,
          status: dto.status,
          startsAt: dto.startsAt !== undefined ? range.startsAt : undefined,
          endsAt: dto.endsAt !== undefined ? range.endsAt : undefined,
          durationMinutes:
            dto.startsAt !== undefined || dto.endsAt !== undefined
              ? range.durationMinutes
              : undefined,
          timezone: dto.timezone !== undefined ? this.trimOrNull(dto.timezone) ?? 'UTC' : undefined,
          location: dto.location !== undefined ? this.trimOrNull(dto.location) : undefined,
          isAllDay: dto.isAllDay,
          updatedByUserId: actorUserId,
        },
      });

      if (startsAtChanged) {
        await tx.eventReminderDispatch.deleteMany({
          where: {
            eventId: existing.id,
          },
        });
      }

      if (participantsPayload) {
        await tx.eventParticipant.deleteMany({
          where: {
            eventId: existing.id,
          },
        });

        if (participantsPayload.length > 0) {
          await tx.eventParticipant.createMany({
            data: participantsPayload.map((participant) => ({
              eventId: existing.id,
              participantId: participant.participantId,
              templateRoleId: participant.templateRoleId,
              roleName: participant.roleName,
              attendanceStatus: participant.attendanceStatus,
              isRequired: participant.isRequired,
              notes: participant.notes,
            })),
          });
        }
      }

      await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId,
          targetType: AuditTargetType.EVENT,
          targetId: existing.id,
          action: 'event.updated',
          description: 'Event updated',
          payload: this.toAuditPayload(dto),
        },
      });
    });

    const updatedEvent = await this.getEvent(organizationId, existing.id);

    await this.notifyEventParticipantsSafe({
      organizationId,
      eventId: updatedEvent.id,
      actorUserId,
      type: NotificationType.EVENT_UPDATED,
      title: `Event "${updatedEvent.title}" was updated`,
      body: `Updated start: ${updatedEvent.startsAt.toISOString()}`,
      payload: {
        eventId: updatedEvent.id,
        eventTitle: updatedEvent.title,
        startsAt: updatedEvent.startsAt.toISOString(),
        type: updatedEvent.type,
      },
    });

    return updatedEvent;
  }

  async replaceEventParticipants(
    organizationId: string,
    eventId: string,
    actorUserId: string,
    dto: SetEventParticipantsDto,
  ) {
    const event = await this.prisma.event.findFirst({
      where: {
        id: eventId,
        organizationId,
        deletedAt: null,
      },
      select: {
        id: true,
        templateId: true,
        startsAt: true,
        endsAt: true,
      },
    });

    if (!event) {
      throw new NotFoundException('Событие не найдено');
    }

    const participants = await this.normalizeEventParticipants(
      organizationId,
      event.templateId,
      dto.participants,
    );

    if (participants.length > 0) {
      const conflicts = await this.detectConflicts({
        organizationId,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        participantIds: participants.map((item) => item.participantId),
        excludeEventId: event.id,
      });

      if (conflicts.hasConflicts && !dto.ignoreConflicts) {
        throw new ConflictException({
          message: 'Обнаружены конфликты участников',
          conflicts,
        });
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.eventParticipant.deleteMany({
        where: {
          eventId: event.id,
        },
      });

      if (participants.length > 0) {
        await tx.eventParticipant.createMany({
          data: participants.map((participant) => ({
            eventId: event.id,
            participantId: participant.participantId,
            templateRoleId: participant.templateRoleId,
            roleName: participant.roleName,
            attendanceStatus: participant.attendanceStatus,
            isRequired: participant.isRequired,
            notes: participant.notes,
          })),
        });
      }

      await tx.event.update({
        where: {
          id: event.id,
        },
        data: {
          updatedByUserId: actorUserId,
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId,
          targetType: AuditTargetType.EVENT,
          targetId: event.id,
          action: 'event.participants.updated',
          description: 'Event participants updated',
          payload: {
            participantsCount: participants.length,
          },
        },
      });
    });

    const updatedEvent = await this.getEvent(organizationId, event.id);

    await this.notifyEventParticipantsSafe({
      organizationId,
      eventId: updatedEvent.id,
      actorUserId,
      type: NotificationType.EVENT_ASSIGNED,
      title: `Participants updated for "${updatedEvent.title}"`,
      body: `Event starts at ${updatedEvent.startsAt.toISOString()}`,
      payload: {
        eventId: updatedEvent.id,
        eventTitle: updatedEvent.title,
        startsAt: updatedEvent.startsAt.toISOString(),
        participantsCount: updatedEvent.participants.length,
      },
    });

    return updatedEvent;
  }

  async archiveEvent(organizationId: string, eventId: string, actorUserId: string) {
    const event = await this.prisma.event.findFirst({
      where: {
        id: eventId,
        organizationId,
      },
      select: {
        id: true,
        deletedAt: true,
      },
    });

    if (!event) {
      throw new NotFoundException('Событие не найдено');
    }

    if (event.deletedAt) {
      return {
        success: true as const,
        alreadyDeleted: true as const,
      };
    }

    const deletedAt = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.event.update({
        where: {
          id: event.id,
        },
        data: {
          deletedAt,
          updatedByUserId: actorUserId,
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId,
          targetType: AuditTargetType.EVENT,
          targetId: event.id,
          action: 'event.archived',
          description: 'Event archived',
        },
      });
    });

    return {
      success: true as const,
      deletedAt: deletedAt.toISOString(),
    };
  }

  async checkEventConflicts(organizationId: string, dto: CheckEventConflictsDto) {
    const range = this.parseDateRange(dto.startsAt, dto.endsAt);

    const participantIds = this.deduplicateUuids(dto.participantIds);

    await this.ensureParticipantsExist(organizationId, participantIds);

    return this.detectConflicts({
      organizationId,
      startsAt: range.startsAt,
      endsAt: range.endsAt,
      participantIds,
      excludeEventId: dto.excludeEventId,
    });
  }

  private async detectConflicts(params: {
    organizationId: string;
    startsAt: Date;
    endsAt: Date;
    participantIds: string[];
    excludeEventId?: string;
  }): Promise<ConflictCheckResult> {
    const participantIds = this.deduplicateUuids(params.participantIds);

    if (participantIds.length === 0) {
      return {
        hasConflicts: false,
        conflictsByParticipant: [],
        summary: {
          participantsChecked: 0,
          conflictedParticipants: 0,
          eventConflicts: 0,
          availabilityConflicts: 0,
        },
        suggestion: null,
      };
    }

    const participants = await this.prisma.participant.findMany({
      where: {
        organizationId: params.organizationId,
        id: {
          in: participantIds,
        },
        deletedAt: null,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        displayName: true,
      },
    });

    const participantNameById = new Map(
      participants.map((participant) => [
        participant.id,
        participant.displayName ?? `${participant.firstName} ${participant.lastName}`.trim(),
      ]),
    );

    const [eventConflicts, availabilityConflicts] = await Promise.all([
      this.prisma.eventParticipant.findMany({
        where: {
          participantId: {
            in: participantIds,
          },
          event: {
            organizationId: params.organizationId,
            deletedAt: null,
            status: {
              not: EventStatus.CANCELLED,
            },
            startsAt: {
              lt: params.endsAt,
            },
            endsAt: {
              gt: params.startsAt,
            },
            ...(params.excludeEventId ? { id: { not: params.excludeEventId } } : {}),
          },
        },
        select: {
          participantId: true,
          eventId: true,
          event: {
            select: {
              id: true,
              title: true,
              startsAt: true,
              endsAt: true,
              status: true,
            },
          },
        },
      }),
      this.prisma.participantAvailability.findMany({
        where: {
          organizationId: params.organizationId,
          participantId: {
            in: participantIds,
          },
          startsAt: {
            lt: params.endsAt,
          },
          endsAt: {
            gt: params.startsAt,
          },
          status: {
            in: [
              AvailabilityStatus.BUSY,
              AvailabilityStatus.TENTATIVE,
              AvailabilityStatus.UNAVAILABLE,
            ],
          },
        },
        select: {
          id: true,
          participantId: true,
          startsAt: true,
          endsAt: true,
          status: true,
          reason: true,
        },
      }),
    ]);

    const conflictsByParticipant = new Map<string, ConflictItem[]>();
    let latestConflictEnd: Date | null = null;

    for (const conflict of eventConflicts) {
      const participantConflicts =
        conflictsByParticipant.get(conflict.participantId) ?? [];

      participantConflicts.push({
        type: 'EVENT',
        relatedId: conflict.eventId,
        startsAt: conflict.event.startsAt.toISOString(),
        endsAt: conflict.event.endsAt.toISOString(),
        status: conflict.event.status,
        title: conflict.event.title,
      });

      conflictsByParticipant.set(conflict.participantId, participantConflicts);

      if (!latestConflictEnd || latestConflictEnd < conflict.event.endsAt) {
        latestConflictEnd = conflict.event.endsAt;
      }
    }

    for (const conflict of availabilityConflicts) {
      const participantConflicts =
        conflictsByParticipant.get(conflict.participantId) ?? [];

      participantConflicts.push({
        type: 'AVAILABILITY',
        relatedId: conflict.id,
        startsAt: conflict.startsAt.toISOString(),
        endsAt: conflict.endsAt.toISOString(),
        status: conflict.status,
        reason: conflict.reason,
      });

      conflictsByParticipant.set(conflict.participantId, participantConflicts);

      if (!latestConflictEnd || latestConflictEnd < conflict.endsAt) {
        latestConflictEnd = conflict.endsAt;
      }
    }

    const conflictsList: ConflictParticipantEntry[] = [];

    for (const participantId of participantIds) {
      const participantConflicts = conflictsByParticipant.get(participantId);

      if (!participantConflicts || participantConflicts.length === 0) {
        continue;
      }

      conflictsList.push({
        participantId,
        participantName: participantNameById.get(participantId) ?? participantId,
        conflicts: participantConflicts.sort((left, right) =>
          left.startsAt.localeCompare(right.startsAt),
        ),
      });
    }

    const durationMs = params.endsAt.getTime() - params.startsAt.getTime();

    return {
      hasConflicts: conflictsList.length > 0,
      conflictsByParticipant: conflictsList,
      summary: {
        participantsChecked: participantIds.length,
        conflictedParticipants: conflictsList.length,
        eventConflicts: eventConflicts.length,
        availabilityConflicts: availabilityConflicts.length,
      },
      suggestion: latestConflictEnd
        ? {
            recommendedStartsAt: latestConflictEnd.toISOString(),
            recommendedEndsAt: new Date(latestConflictEnd.getTime() + durationMs).toISOString(),
          }
        : null,
    };
  }

  private async normalizeTemplateRoles(
    organizationId: string,
    roles: TemplateRoleInputDto[],
  ): Promise<NormalizedTemplateRoleInput[]> {
    const normalizedRoles = roles.map((role, index) => ({
      name: this.requireTrimmedText(role.name, 'template role name'),
      requiredCount: role.requiredCount ?? 1,
      sortOrder: role.sortOrder ?? index,
      description: this.trimOrNull(role.description),
      participantIds: this.deduplicateUuids(role.participantIds ?? []),
    }));

    const names = new Set<string>();
    const participantAssignments = new Map<string, string>();

    for (const role of normalizedRoles) {
      const key = role.name.toLowerCase();

      if (names.has(key)) {
        throw new BadRequestException(`Роль шаблона '${role.name}' указана несколько раз`);
      }

      names.add(key);

      for (const participantId of role.participantIds) {
        const assignedRole = participantAssignments.get(participantId);

        if (assignedRole) {
          throw new BadRequestException(
            `Участник ${participantId} назначен на несколько ролей шаблона`,
          );
        }

        participantAssignments.set(participantId, role.name);
      }
    }

    await this.ensureParticipantsExist(
      organizationId,
      Array.from(participantAssignments.keys()),
    );

    return normalizedRoles;
  }

  private async replaceTemplateRoles(
    tx: Prisma.TransactionClient,
    templateId: string,
    roles: NormalizedTemplateRoleInput[],
  ) {
    await tx.templateRole.deleteMany({
      where: {
        templateId,
      },
    });

    for (const role of roles) {
      const createdRole = await tx.templateRole.create({
        data: {
          templateId,
          name: role.name,
          requiredCount: role.requiredCount,
          sortOrder: role.sortOrder,
          description: role.description,
        },
        select: {
          id: true,
        },
      });

      if (role.participantIds.length > 0) {
        await tx.templateRoleAssignment.createMany({
          data: role.participantIds.map((participantId) => ({
            templateRoleId: createdRole.id,
            participantId,
          })),
        });
      }
    }
  }

  private async buildParticipantsFromTemplate(
    organizationId: string,
    templateId: string | null,
  ): Promise<NormalizedEventParticipantInput[]> {
    if (!templateId) {
      return [];
    }

    const roles = await this.prisma.templateRole.findMany({
      where: {
        templateId,
        template: {
          organizationId,
          deletedAt: null,
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        name: true,
        assignments: {
          orderBy: [{ createdAt: 'asc' }],
          select: {
            participantId: true,
          },
        },
      },
    });

    const participants: NormalizedEventParticipantInput[] = [];
    const seen = new Set<string>();

    for (const role of roles) {
      for (const assignment of role.assignments) {
        if (seen.has(assignment.participantId)) {
          continue;
        }

        seen.add(assignment.participantId);

        participants.push({
          participantId: assignment.participantId,
          templateRoleId: role.id,
          roleName: role.name,
          attendanceStatus: EventAttendanceStatus.INVITED,
          isRequired: true,
          notes: null,
        });
      }
    }

    await this.ensureParticipantsExist(
      organizationId,
      participants.map((participant) => participant.participantId),
    );

    return participants;
  }

  private async normalizeEventParticipants(
    organizationId: string,
    templateId: string | null,
    participants: EventParticipantInputDto[],
  ): Promise<NormalizedEventParticipantInput[]> {
    const result: NormalizedEventParticipantInput[] = [];
    const seenParticipants = new Set<string>();

    for (const participant of participants) {
      if (seenParticipants.has(participant.participantId)) {
        throw new BadRequestException(
          `Участник ${participant.participantId} повторяется в данных события`,
        );
      }

      seenParticipants.add(participant.participantId);

      result.push({
        participantId: participant.participantId,
        templateRoleId: participant.templateRoleId ?? null,
        roleName: this.trimOrNull(participant.roleName),
        attendanceStatus: participant.attendanceStatus ?? EventAttendanceStatus.INVITED,
        isRequired: participant.isRequired ?? true,
        notes: this.trimOrNull(participant.notes),
      });
    }

    await this.ensureParticipantsExist(
      organizationId,
      result.map((item) => item.participantId),
    );

    const templateRoleIds = this.deduplicateUuids(
      result
        .map((item) => item.templateRoleId)
        .filter((value): value is string => value !== null),
    );

    if (templateRoleIds.length > 0) {
      const roles = await this.prisma.templateRole.findMany({
        where: {
          id: {
            in: templateRoleIds,
          },
          template: {
            organizationId,
            deletedAt: null,
            ...(templateId ? { id: templateId } : {}),
          },
        },
        select: {
          id: true,
          name: true,
        },
      });

      if (roles.length !== templateRoleIds.length) {
        throw new BadRequestException('Некоторые значения templateRoleId некорректны');
      }

      const roleById = new Map(roles.map((role) => [role.id, role.name]));

      for (const participant of result) {
        if (!participant.templateRoleId) {
          continue;
        }

        if (!participant.roleName) {
          participant.roleName = roleById.get(participant.templateRoleId) ?? null;
        }
      }
    }

    return result;
  }

  private async ensureTemplateExists(organizationId: string, templateId: string) {
    const template = await this.prisma.template.findFirst({
      where: {
        id: templateId,
        organizationId,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (!template) {
      throw new NotFoundException('Шаблон не найден');
    }

    return template;
  }

  private async ensureUserExists(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
        isActive: true,
        deletedAt: true,
      },
    });

    if (!user || !user.isActive || user.deletedAt) {
      throw new BadRequestException('Связанный пользователь не существует');
    }
  }

  private async ensureUserCanBeLinked(
    organizationId: string,
    userId: string,
    excludeParticipantId?: string,
  ) {
    const existing = await this.prisma.participant.findFirst({
      where: {
        organizationId,
        userId,
        ...(excludeParticipantId ? { id: { not: excludeParticipantId } } : {}),
      },
      select: {
        id: true,
      },
    });

    if (existing) {
      throw new ConflictException('Пользователь уже связан с другим участником');
    }
  }

  private async ensureParticipantsExist(organizationId: string, participantIds: string[]) {
    const uniqueIds = this.deduplicateUuids(participantIds);

    if (uniqueIds.length === 0) {
      return;
    }

    const participants = await this.prisma.participant.findMany({
      where: {
        organizationId,
        id: {
          in: uniqueIds,
        },
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (participants.length !== uniqueIds.length) {
      const existingIds = new Set(participants.map((participant) => participant.id));
      const missing = uniqueIds.filter((participantId) => !existingIds.has(participantId));

      throw new BadRequestException(
        `Неизвестные или архивные участники: ${missing.join(', ')}`,
      );
    }
  }

  private async notifyEventParticipantsSafe(input: {
    organizationId: string;
    eventId: string;
    actorUserId: string;
    type: NotificationType;
    title: string;
    body: string;
    payload?: Record<string, unknown>;
  }) {
    try {
      await this.notificationsService.notifyEventParticipants({
        organizationId: input.organizationId,
        eventId: input.eventId,
        actorUserId: input.actorUserId,
        type: input.type,
        title: input.title,
        body: input.body,
        payload: input.payload,
      });
    } catch (error) {
      this.logger.warn(
        `Failed to send event notification for event=${input.eventId}: ${(error as Error).message}`,
      );
    }
  }

  private parseDateRange(startsAtIso: string, endsAtIso: string) {
    const startsAt = new Date(startsAtIso);
    const endsAt = new Date(endsAtIso);

    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      throw new BadRequestException('Некорректный диапазон дат');
    }

    if (endsAt <= startsAt) {
      throw new BadRequestException('Время окончания должно быть позже времени начала');
    }

    const durationMs = endsAt.getTime() - startsAt.getTime();

    return {
      startsAt,
      endsAt,
      durationMinutes: Math.ceil(durationMs / (60 * 1000)),
    };
  }

  private deduplicateUuids(values: string[]): string[] {
    return Array.from(new Set(values));
  }

  private requireTrimmedText(value: string, field: string, minLength = 1): string {
    const normalized = value.trim();

    if (normalized.length < minLength) {
      throw new BadRequestException(`${field} должно содержать минимум ${minLength} символа(ов)`);
    }

    return normalized;
  }

  private async syncParticipantsFromMemberships(organizationId: string) {
    const activeMemberships = await this.prisma.membership.findMany({
      where: {
        organizationId,
        status: MembershipStatus.ACTIVE,
        user: {
          is: {
            isActive: true,
            deletedAt: null,
          },
        },
      },
      select: {
        organizationId: true,
        userId: true,
        user: {
          select: {
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    for (const membership of activeMemberships) {
      if (!membership.user) {
        continue;
      }

      await this.prisma.participant.upsert({
        where: {
          organizationId_userId: {
            organizationId,
            userId: membership.userId,
          },
        },
        update: {
          firstName: membership.user.firstName?.trim() || membership.user.email,
          lastName: membership.user.lastName?.trim() || ' ',
          email: membership.user.email,
          linkedAt: new Date(),
          deletedAt: null,
          invitationStatus: ParticipantInviteStatus.ACCEPTED,
        },
        create: {
          organizationId,
          userId: membership.userId,
          firstName: membership.user.firstName?.trim() || membership.user.email,
          lastName: membership.user.lastName?.trim() || ' ',
          email: membership.user.email,
          linkedAt: new Date(),
          invitationStatus: ParticipantInviteStatus.ACCEPTED,
        },
      });
    }
  }

  private generateInviteToken(): { rawToken: string; tokenHash: string } {
    const rawToken = randomBytes(32).toString('base64url');

    return {
      rawToken,
      tokenHash: createHash('sha256').update(rawToken).digest('hex'),
    };
  }

  private buildParticipantInviteExpiryDate(from: Date): Date {
    return new Date(from.getTime() + 14 * 24 * 60 * 60 * 1000);
  }

  private trimOrNull(value?: string | null): string | null {
    if (!value) {
      return null;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private normalizeEmail(value?: string | null): string | null {
    const normalized = this.trimOrNull(value);
    return normalized ? normalized.toLowerCase() : null;
  }

  private toAuditPayload(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }
}
