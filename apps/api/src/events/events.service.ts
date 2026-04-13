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
  OrganizationRole,
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
import { PublishWeekScheduleDto } from './dto/publish-week-schedule.dto';
import { SetEventParticipantsDto } from './dto/set-event-participants.dto';
import { TemplateRoleInputDto } from './dto/template-role-input.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { UpdateParticipantDto } from './dto/update-participant.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';

const alternateCastSuffixPattern = /\s+\(дубль\)$/i;
const legacyMainCastRoleName = 'основной состав';
const legacyAlternateCastRoleName = 'дубль';

const isAlternateCastRoleName = (name: string) => {
  const normalized = name.trim().toLowerCase();
  return normalized === legacyAlternateCastRoleName || alternateCastSuffixPattern.test(name.trim());
};

const getBaseCastRoleName = (name: string) => {
  const normalized = name.trim();
  const lowered = normalized.toLowerCase();

  if (lowered === legacyMainCastRoleName || lowered === legacyAlternateCastRoleName) {
    return 'Состав';
  }

  return normalized.replace(alternateCastSuffixPattern, '').trim() || 'Роль';
};

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
  assemblyAt: true,
  durationMinutes: true,
  timezone: true,
  location: true,
  performanceCastNumber: true,
  performanceCastLocked: true,
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
  checklistItems: {
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      label: true,
      category: true,
      notes: true,
      sortOrder: true,
      isCompleted: true,
      completedAt: true,
      completedByUserId: true,
      createdAt: true,
      updatedAt: true,
    },
  },
} satisfies Prisma.EventSelect;

const eventTypeLabelMap: Record<EventType, string> = {
  PERFORMANCE: 'Спектакль',
  REHEARSAL: 'Репетиция',
  TOUR: 'Гастроли',
  EVENT: 'Событие',
  CUSTOM: 'Событие',
};

const eventNotificationDateTimeFormat = new Intl.DateTimeFormat('ru-RU', {
  weekday: 'short',
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

const eventNotificationWeekDateFormat = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: 'short',
});

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

type TemplateRoleRecord = {
  id: string;
  name: string;
  sortOrder: number;
  assignments: Array<{
    participantId: string;
  }>;
};

type ResolvedPerformanceCast = {
  castNumber: 1 | 2 | null;
  castLocked: boolean;
  templateRoles: TemplateRoleRecord[];
  hasAlternateCast: boolean;
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

type EventNotificationSnapshot = {
  id: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  type: EventType;
  status: EventStatus;
  location: string | null;
};

type EventChangeSummary = {
  changedFields: string[];
  urgent: boolean;
  checklistChanged: boolean;
};

type ParticipantRecord = Prisma.ParticipantGetPayload<{
  select: typeof participantSelect;
}>;

type EventRecord = Prisma.EventGetPayload<{
  select: typeof eventSelect;
}>;

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async listParticipants(
    organizationId: string,
    userId: string,
    query: ListParticipantsQueryDto,
  ) {
    await this.syncParticipantsFromMemberships(organizationId);
    const membershipRole = await this.getMembershipRoleOrThrow(organizationId, userId);

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

    const participants = await this.prisma.participant.findMany({
      where,
      select: participantSelect,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: query.limit ?? 200,
    });

    return membershipRole === OrganizationRole.MEMBER
      ? participants.map((participant) => this.toMemberSafeParticipant(participant))
      : participants;
  }

  async getParticipant(organizationId: string, participantId: string, userId: string) {
    const membershipRole = await this.getMembershipRoleOrThrow(organizationId, userId);
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

    return membershipRole === OrganizationRole.MEMBER
      ? this.toMemberSafeParticipant(participant)
      : participant;
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

  async listEvents(
    organizationId: string,
    userId: string,
    query: ListEventsQueryDto,
  ) {
    const membershipRole = await this.getMembershipRoleOrThrow(organizationId, userId);
    const where: Prisma.EventWhereInput = {
      organizationId,
      deletedAt: null,
      type: query.type,
      status: query.status,
      templateId: query.templateId,
      ...(query.status || query.includeDrafts ? {} : { NOT: { status: EventStatus.DRAFT } }),
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

    const events = await this.prisma.event.findMany({
      where,
      select: eventSelect,
      orderBy: [{ startsAt: 'asc' }, { createdAt: 'asc' }],
      take: query.limit ?? 300,
    });

    return membershipRole === OrganizationRole.MEMBER
      ? events.map((event) => this.toMemberSafeEvent(event))
      : events;
  }

  async listEventHistory(organizationId: string, eventId: string, userId: string) {
    await this.getEvent(organizationId, eventId, userId);

    return this.prisma.auditLog.findMany({
      where: {
        organizationId,
        targetType: AuditTargetType.EVENT,
        targetId: eventId,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 30,
      select: {
        id: true,
        action: true,
        description: true,
        payload: true,
        createdAt: true,
        actor: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });
  }

  async getEvent(organizationId: string, eventId: string, userId: string) {
    const membershipRole = await this.getMembershipRoleOrThrow(organizationId, userId);
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

    return membershipRole === OrganizationRole.MEMBER
      ? this.toMemberSafeEvent(event)
      : event;
  }

  private async getMembershipRoleOrThrow(
    organizationId: string,
    userId: string,
  ): Promise<OrganizationRole> {
    const membership = await this.prisma.membership.findFirst({
      where: {
        organizationId,
        userId,
        status: MembershipStatus.ACTIVE,
        organization: {
          deletedAt: null,
        },
      },
      select: {
        role: true,
      },
    });

    if (!membership) {
      throw new NotFoundException('Active organization membership not found');
    }

    return membership.role;
  }

  private toMemberSafeParticipant(participant: ParticipantRecord) {
    return {
      id: participant.id,
      organizationId: participant.organizationId,
      firstName: participant.firstName,
      lastName: participant.lastName,
      middleName: participant.middleName,
      displayName: participant.displayName,
      invitationStatus: participant.invitationStatus,
      invitedAt: participant.invitedAt,
      linkedAt: participant.linkedAt,
      createdAt: participant.createdAt,
      updatedAt: participant.updatedAt,
      deletedAt: participant.deletedAt,
    };
  }

  private toMemberSafeEvent(event: EventRecord) {
    return {
      ...event,
      participants: event.participants.map((participant) => ({
        ...participant,
        participant: this.toMemberSafeParticipant(participant.participant),
      })),
    };
  }

  private async getParticipantRecordOrThrow(
    organizationId: string,
    participantId: string,
  ): Promise<ParticipantRecord> {
    const participant = await this.prisma.participant.findFirst({
      where: {
        id: participantId,
        organizationId,
      },
      select: participantSelect,
    });

    if (!participant || participant.deletedAt) {
      throw new NotFoundException('РЈС‡Р°СЃС‚РЅРёРє РЅРµ РЅР°Р№РґРµРЅ');
    }

    return participant;
  }

  private async getEventRecordOrThrow(
    organizationId: string,
    eventId: string,
  ): Promise<EventRecord> {
    const event = await this.prisma.event.findFirst({
      where: {
        id: eventId,
        organizationId,
        deletedAt: null,
      },
      select: eventSelect,
    });

    if (!event) {
      throw new NotFoundException('РЎРѕР±С‹С‚РёРµ РЅРµ РЅР°Р№РґРµРЅРѕ');
    }

    return event;
  }

  async createEvent(organizationId: string, actorUserId: string, dto: CreateEventDto) {
    const title = this.requireTrimmedText(dto.title, 'title', 2);
    const range = this.parseDateRange(dto.startsAt, dto.endsAt);
    const eventType = dto.type ?? EventType.EVENT;
    const assemblyAt = this.parseAssemblyAt(dto.assemblyAt, range.startsAt, eventType);

    const templateId = dto.templateId ?? null;
    if (templateId) {
      await this.ensureTemplateExists(organizationId, templateId);
    }

    const resolvedCast = await this.resolvePerformanceCast({
      organizationId,
      type: eventType,
      templateId,
      startsAt: range.startsAt,
      requestedCastNumber: dto.performanceCastNumber ?? null,
      useAutomatic: dto.useAutomaticPerformanceCast,
      recalculateAutomatically: true,
    });

    if (
      dto.participants !== undefined &&
      eventType === EventType.PERFORMANCE &&
      templateId &&
      resolvedCast.hasAlternateCast
    ) {
      throw new BadRequestException(
        'Для спектакля с дублем состав выбирается автоматически или через переключение состава дня.',
      );
    }

    const participants =
      dto.participants !== undefined
        ? await this.normalizeEventParticipants(organizationId, templateId, dto.participants)
        : templateId
          ? await this.buildParticipantsFromTemplate(
              organizationId,
              templateId,
              resolvedCast.castNumber,
              resolvedCast.templateRoles,
            )
          : [];
    const checklistItems = this.normalizeChecklistItems(dto.checklistItems);

    if (participants.length > 0) {
      const conflicts = await this.detectConflicts({
        organizationId,
        startsAt: assemblyAt ?? range.startsAt,
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
          type: eventType,
          status: dto.status ?? EventStatus.PLANNED,
          startsAt: range.startsAt,
          endsAt: range.endsAt,
          assemblyAt,
          durationMinutes: range.durationMinutes,
          timezone: this.trimOrNull(dto.timezone) ?? 'UTC',
          location: this.trimOrNull(dto.location),
          performanceCastNumber: resolvedCast.castNumber,
          performanceCastLocked: resolvedCast.castLocked,
          isAllDay: dto.isAllDay ?? false,
          createdByUserId: actorUserId,
          updatedByUserId: actorUserId,
        },
        select: {
          id: true,
          title: true,
        },
      });

      const shouldSyncPerformanceDay =
        eventType === EventType.PERFORMANCE &&
        templateId !== null &&
        resolvedCast.hasAlternateCast &&
        resolvedCast.castNumber !== null;

      if (shouldSyncPerformanceDay) {
        await this.syncPerformanceCastForDay(tx, {
          organizationId,
          templateId,
          startsAt: range.startsAt,
          castNumber: resolvedCast.castNumber as 1 | 2,
          castLocked: resolvedCast.castLocked,
          actorUserId,
          templateRoles: resolvedCast.templateRoles,
        });
      } else if (participants.length > 0) {
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

      if (checklistItems.length > 0) {
        await tx.eventChecklistItem.createMany({
          data: checklistItems.map((item, index) => ({
            eventId: event.id,
            label: item.label,
            category: item.category,
            notes: item.notes,
            sortOrder: item.sortOrder ?? index,
            isCompleted: item.isCompleted,
            completedAt: item.isCompleted ? new Date() : null,
            completedByUserId: item.isCompleted ? actorUserId : null,
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
            checklistItemsCount: checklistItems.length,
          },
        },
      });

      return event.id;
    });

    const createdEvent = await this.getEventRecordOrThrow(organizationId, created);

    if (
      createdEvent.status !== EventStatus.DRAFT &&
      createdEvent.status !== EventStatus.CANCELLED
    ) {
      await this.notifyScheduleChangeSafe({
        organizationId,
        actorUserId,
        event: this.toEventNotificationSnapshot(createdEvent),
        userIds: this.extractLinkedUserIds(createdEvent.participants),
        variant: 'assigned',
      });
    }

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
        title: true,
        templateId: true,
        type: true,
        status: true,
        startsAt: true,
        endsAt: true,
        assemblyAt: true,
        location: true,
        performanceCastNumber: true,
        performanceCastLocked: true,
        participants: {
          select: {
            participantId: true,
            participant: {
              select: {
                userId: true,
              },
            },
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
    const nextType = dto.type ?? existing.type;
    const assemblyAt =
      dto.assemblyAt !== undefined || dto.startsAt !== undefined || dto.type !== undefined
        ? this.parseAssemblyAt(
            dto.assemblyAt ?? existing.assemblyAt?.toISOString() ?? null,
            range.startsAt,
            nextType,
          )
        : existing.assemblyAt;

    const title =
      dto.title !== undefined ? this.requireTrimmedText(dto.title, 'title', 2) : undefined;
    const templateId =
      dto.templateId !== undefined ? dto.templateId : existing.templateId;

    if (dto.templateId !== undefined && templateId !== null) {
      await this.ensureTemplateExists(organizationId, templateId);
    }

    const startsAtChanged =
      dto.startsAt !== undefined &&
      range.startsAt.getTime() !== existing.startsAt.getTime();
    const templateChanged =
      dto.templateId !== undefined && templateId !== existing.templateId;
    const typeChanged = dto.type !== undefined && nextType !== existing.type;
    const castSelectionChanged =
      dto.performanceCastNumber !== undefined || dto.useAutomaticPerformanceCast === true;

    const resolvedCast = await this.resolvePerformanceCast({
      organizationId,
      type: nextType,
      templateId,
      startsAt: range.startsAt,
      excludeEventId: existing.id,
      requestedCastNumber: dto.performanceCastNumber ?? null,
      useAutomatic: dto.useAutomaticPerformanceCast,
      recalculateAutomatically:
        startsAtChanged ||
        templateChanged ||
        typeChanged ||
        castSelectionChanged ||
        existing.performanceCastNumber === null,
      existingCastNumber: existing.performanceCastNumber,
      existingCastLocked: existing.performanceCastLocked,
    });

    if (
      dto.participants !== undefined &&
      nextType === EventType.PERFORMANCE &&
      templateId &&
      resolvedCast.hasAlternateCast
    ) {
      throw new BadRequestException(
        'Для спектакля с дублем состав выбирается автоматически или через переключение состава дня.',
      );
    }

    const participantsPayload =
      dto.participants !== undefined
        ? await this.normalizeEventParticipants(organizationId, templateId, dto.participants)
        : nextType === EventType.PERFORMANCE &&
            templateId &&
            (templateChanged ||
              startsAtChanged ||
              typeChanged ||
              castSelectionChanged ||
              existing.performanceCastNumber !== resolvedCast.castNumber ||
              existing.performanceCastLocked !== resolvedCast.castLocked)
          ? await this.buildParticipantsFromTemplate(
              organizationId,
              templateId,
              resolvedCast.castNumber,
              resolvedCast.templateRoles,
            )
          : null;
    const checklistItems =
      dto.checklistItems !== undefined ? this.normalizeChecklistItems(dto.checklistItems) : null;

    const participantIdsToCheck =
      participantsPayload?.map((item) => item.participantId) ??
      existing.participants.map((participant) => participant.participantId);

    if (participantIdsToCheck.length > 0) {
      const conflicts = await this.detectConflicts({
        organizationId,
        startsAt: assemblyAt ?? range.startsAt,
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
          assemblyAt:
            dto.assemblyAt !== undefined || dto.startsAt !== undefined || dto.type !== undefined
              ? assemblyAt
              : undefined,
          durationMinutes:
            dto.startsAt !== undefined || dto.endsAt !== undefined
              ? range.durationMinutes
              : undefined,
          timezone: dto.timezone !== undefined ? this.trimOrNull(dto.timezone) ?? 'UTC' : undefined,
          location: dto.location !== undefined ? this.trimOrNull(dto.location) : undefined,
          performanceCastNumber: resolvedCast.castNumber,
          performanceCastLocked: resolvedCast.castLocked,
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

      const shouldSyncPerformanceDay =
        nextType === EventType.PERFORMANCE &&
        templateId !== null &&
        resolvedCast.hasAlternateCast &&
        resolvedCast.castNumber !== null;

      if (shouldSyncPerformanceDay) {
        await this.syncPerformanceCastForDay(tx, {
          organizationId,
          templateId,
          startsAt: range.startsAt,
          castNumber: resolvedCast.castNumber as 1 | 2,
          castLocked: resolvedCast.castLocked,
          actorUserId,
          templateRoles: resolvedCast.templateRoles,
        });
      } else if (participantsPayload) {
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

      if (checklistItems) {
        await tx.eventChecklistItem.deleteMany({
          where: {
            eventId: existing.id,
          },
        });

        if (checklistItems.length > 0) {
          await tx.eventChecklistItem.createMany({
            data: checklistItems.map((item, index) => ({
              eventId: existing.id,
              label: item.label,
              category: item.category,
              notes: item.notes,
              sortOrder: item.sortOrder ?? index,
              isCompleted: item.isCompleted,
              completedAt: item.isCompleted ? new Date() : null,
              completedByUserId: item.isCompleted ? actorUserId : null,
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
          payload: this.toAuditPayload(
            this.buildEventChangePayload(existing, {
              title,
              description: dto.description,
              type: dto.type,
              status: dto.status,
              startsAt: dto.startsAt !== undefined ? range.startsAt : undefined,
              endsAt: dto.endsAt !== undefined ? range.endsAt : undefined,
              assemblyAt:
                dto.assemblyAt !== undefined || dto.startsAt !== undefined || dto.type !== undefined
                  ? assemblyAt
                  : undefined,
              location: dto.location !== undefined ? this.trimOrNull(dto.location) : undefined,
              participantsCount: participantsPayload ? participantsPayload.length : undefined,
              checklistItemsCount: checklistItems ? checklistItems.length : undefined,
            }),
          ),
        },
      });
    });

    const updatedEvent = await this.getEventRecordOrThrow(organizationId, existing.id);
    const existingSnapshot = this.toEventNotificationSnapshot(existing);
    const updatedSnapshot = this.toEventNotificationSnapshot(updatedEvent);
    const changeSummary = this.buildEventChangeSummary(existing, updatedEvent, {
      participantsChanged: participantsPayload !== null,
      checklistChanged: checklistItems !== null,
    });
    const eventParticipantUserIds = this.extractLinkedUserIds(updatedEvent.participants);
    const replacementDetected =
      existing.type === EventType.PERFORMANCE &&
      updatedEvent.type === EventType.PERFORMANCE &&
      templateChanged &&
      existing.templateId !== updatedEvent.templateId;

    if (existing.status === EventStatus.DRAFT && updatedEvent.status === EventStatus.DRAFT) {
      return updatedEvent;
    }

    if (existing.status === EventStatus.DRAFT && updatedEvent.status === EventStatus.CANCELLED) {
      return updatedEvent;
    }

    if (updatedEvent.status === EventStatus.DRAFT) {
      await this.notifyScheduleChangeSafe({
        organizationId,
        actorUserId,
        event: updatedSnapshot,
        userIds: eventParticipantUserIds,
        previousEvent: existingSnapshot,
        variant: 'draft',
        changeSummary,
      });
    } else if (updatedEvent.status === EventStatus.CANCELLED && existing.status !== EventStatus.CANCELLED) {
      await this.notifyScheduleChangeSafe({
        organizationId,
        actorUserId,
        event: updatedSnapshot,
        userIds: eventParticipantUserIds,
        previousEvent: existingSnapshot,
        variant: 'cancelled',
        changeSummary,
      });
    } else if (existing.status === EventStatus.DRAFT) {
      await this.notifyScheduleChangeSafe({
        organizationId,
        actorUserId,
        event: updatedSnapshot,
        userIds: eventParticipantUserIds,
        previousEvent: existingSnapshot,
        variant: 'assigned',
        changeSummary,
      });
    } else {
      await this.notifyScheduleChangeSafe({
        organizationId,
        actorUserId,
        event: updatedSnapshot,
        userIds: eventParticipantUserIds,
        previousEvent: existingSnapshot,
        variant: replacementDetected ? 'replacement' : 'updated',
        changeSummary,
      });
    }

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
        title: true,
        templateId: true,
        type: true,
        status: true,
        startsAt: true,
        endsAt: true,
        location: true,
        participants: {
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

    if (!event) {
      throw new NotFoundException('Событие не найдено');
    }

    if (event.type === EventType.PERFORMANCE && event.templateId) {
      const templateRoles = await this.loadTemplateRoles(organizationId, event.templateId);

      if (this.hasAlternateCastRoles(templateRoles)) {
        throw new BadRequestException(
          'Для спектакля с дублем состав нужно переключать по дню, а не редактировать участников вручную.',
        );
      }
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
            changedFields: ['participants'],
          },
        },
      });
    });

    const updatedEvent = await this.getEventRecordOrThrow(organizationId, event.id);
    if (updatedEvent.status !== EventStatus.DRAFT) {
      await this.notifyScheduleChangeSafe({
        organizationId,
        actorUserId,
        event: this.toEventNotificationSnapshot(updatedEvent),
        userIds: this.extractLinkedUserIds(updatedEvent.participants),
        previousEvent: this.toEventNotificationSnapshot(event),
        variant: 'participants',
        changeSummary: {
          changedFields: ['participants'],
          urgent: false,
          checklistChanged: false,
        },
      });
    }

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
        title: true,
        type: true,
        status: true,
        startsAt: true,
        location: true,
        deletedAt: true,
        participants: {
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

    await this.notifyScheduleChangeSafe({
      organizationId,
      actorUserId,
      event: this.toEventNotificationSnapshot(event),
      userIds: this.extractLinkedUserIds(event.participants),
      variant: 'removed',
    });

    return {
      success: true as const,
      deletedAt: deletedAt.toISOString(),
    };
  }

  async publishWeekSchedule(
    organizationId: string,
    actorUserId: string,
    dto: PublishWeekScheduleDto,
  ) {
    const anchorDate = new Date(dto.anchorDate);

    if (Number.isNaN(anchorDate.getTime())) {
      throw new BadRequestException('Некорректная дата недели');
    }

    const { start, end } = this.getWeekBounds(anchorDate);
    const weekEnd = new Date(end);
    weekEnd.setDate(weekEnd.getDate() - 1);

    const draftEvents = await this.prisma.event.findMany({
      where: {
        organizationId,
        deletedAt: null,
        startsAt: {
          gte: start,
          lt: end,
        },
        status: EventStatus.DRAFT,
      },
      orderBy: [{ startsAt: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
      },
    });

    if (draftEvents.length === 0) {
      throw new BadRequestException('В выбранной неделе нет черновиков для публикации');
    }

    const draftIds = draftEvents.map((event) => event.id);

    await this.prisma.$transaction(async (tx) => {
      await tx.event.updateMany({
        where: {
          id: {
            in: draftIds,
          },
        },
        data: {
          status: EventStatus.PLANNED,
          updatedByUserId: actorUserId,
        },
      });

      await tx.auditLog.createMany({
        data: draftIds.map((eventId) => ({
          organizationId,
          actorUserId,
          targetType: AuditTargetType.EVENT,
          targetId: eventId,
          action: 'event.weekly_published',
          description: 'Event published as part of week schedule',
          payload: this.toAuditPayload({
            weekStart: start.toISOString(),
            weekEnd: weekEnd.toISOString(),
            publishedCount: draftIds.length,
          }),
        })),
      });
    });

    const publishedEvents = await this.prisma.event.findMany({
      where: {
        id: {
          in: draftIds,
        },
        deletedAt: null,
      },
      orderBy: [{ startsAt: 'asc' }, { createdAt: 'asc' }],
      select: eventSelect,
    });
    const recipientUserIds = this.extractLinkedUserIdsFromEvents(publishedEvents);

    const notified = await this.notifyWeekSchedulePublishedSafe({
      organizationId,
      actorUserId,
      startsAt: start,
      publishedCount: publishedEvents.length,
      userIds: recipientUserIds,
    });

    return {
      publishedEvents,
      publishedCount: publishedEvents.length,
      weekStart: start.toISOString(),
      weekEnd: weekEnd.toISOString(),
      notified,
    };
  }

  async sendEventReminderNow(
    organizationId: string,
    eventId: string,
    actorUserId: string,
  ) {
    const event = await this.prisma.event.findFirst({
      where: {
        id: eventId,
        organizationId,
        deletedAt: null,
      },
      select: {
        id: true,
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
                is: {
                  isActive: true,
                  deletedAt: null,
                  eventRemindersEnabled: true,
                },
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

    if (!event) {
      throw new NotFoundException('Событие не найдено');
    }

    const userIds = this.deduplicateUuids(
      event.participants
        .map((participant) => participant.participant.userId)
        .filter((userId): userId is string => Boolean(userId)),
    );

    if (userIds.length === 0) {
      return {
        success: true as const,
        sentCount: 0,
      };
    }

    const timezone = this.trimOrNull(event.timezone) ?? 'UTC';
    const result = await this.notificationsService.notifyUsers({
      organizationId,
      eventId: event.id,
      actorUserId,
      type: NotificationType.EVENT_REMINDER,
      title: `Напоминание: ${event.title}`,
      body: `Проверка напоминания. Событие начнётся ${this.formatReminderDateTime(event.startsAt, timezone)}.`,
      payload: {
        eventId: event.id,
        eventTitle: event.title,
        startsAt: event.startsAt.toISOString(),
        url: `/calendar?eventId=${event.id}`,
        reminderType: 'manual_test',
      },
      userIds,
    });

    return {
      success: true as const,
      sentCount: result.usersCount,
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
            endsAt: {
              gt: params.startsAt,
            },
            OR: [
              {
                startsAt: {
                  lt: params.endsAt,
                },
              },
              {
                assemblyAt: {
                  not: null,
                  lt: params.endsAt,
                },
              },
            ],
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
              assemblyAt: true,
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
        startsAt: (conflict.event.assemblyAt ?? conflict.event.startsAt).toISOString(),
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
    const groupedRoles = new Map<
      string,
      {
        mainAssignedCount: number;
        alternateAssignedCount: number;
        hasMain: boolean;
        hasAlternate: boolean;
      }
    >();

    for (const role of normalizedRoles) {
      const key = role.name.toLowerCase();

      if (names.has(key)) {
        throw new BadRequestException(`Роль шаблона '${role.name}' указана несколько раз`);
      }

      names.add(key);

      const groupedRoleKey = getBaseCastRoleName(role.name).toLowerCase();
      const groupedRole = groupedRoles.get(groupedRoleKey) ?? {
        mainAssignedCount: 0,
        alternateAssignedCount: 0,
        hasMain: false,
        hasAlternate: false,
      };

      if (isAlternateCastRoleName(role.name)) {
        groupedRole.hasAlternate = true;
        groupedRole.alternateAssignedCount = role.participantIds.length;
      } else {
        groupedRole.hasMain = true;
        groupedRole.mainAssignedCount = role.participantIds.length;
      }

      groupedRoles.set(groupedRoleKey, groupedRole);

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

    const hasAnyAlternateCast = Array.from(groupedRoles.values()).some(
      (role) => role.hasAlternate,
    );

    if (hasAnyAlternateCast) {
      for (const [roleName, role] of groupedRoles.entries()) {
        if (!role.hasMain || !role.hasAlternate) {
          throw new BadRequestException(
            `Для роли '${roleName}' нужно указать и 1, и 2 состав`,
          );
        }

        if (role.mainAssignedCount === 0 || role.alternateAssignedCount === 0) {
          throw new BadRequestException(
            `Для роли '${roleName}' нужно назначить участников в оба состава`,
          );
        }
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
    castNumber: 1 | 2 | null = null,
    templateRoles?: TemplateRoleRecord[],
  ): Promise<NormalizedEventParticipantInput[]> {
    if (!templateId) {
      return [];
    }

    const roles =
      templateRoles ?? (await this.loadTemplateRoles(organizationId, templateId));

    return this.buildParticipantsFromTemplateRoles(organizationId, roles, castNumber);
  }

  private async loadTemplateRoles(
    organizationId: string,
    templateId: string,
  ): Promise<TemplateRoleRecord[]> {
    return this.prisma.templateRole.findMany({
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
        sortOrder: true,
        assignments: {
          orderBy: [{ createdAt: 'asc' }],
          select: {
            participantId: true,
          },
        },
      },
    });
  }

  private hasAlternateCastRoles(roles: TemplateRoleRecord[]) {
    return roles.some((role) => isAlternateCastRoleName(role.name));
  }

  private buildParticipantsFromTemplateRoles(
    organizationId: string,
    roles: TemplateRoleRecord[],
    castNumber: 1 | 2 | null,
  ): Promise<NormalizedEventParticipantInput[]> {
    const groupedRoles = new Map<
      string,
      {
        main: TemplateRoleRecord | null;
        alternate: TemplateRoleRecord | null;
      }
    >();

    for (const role of roles) {
      const key = getBaseCastRoleName(role.name).toLowerCase();
      const current = groupedRoles.get(key) ?? { main: null, alternate: null };

      if (isAlternateCastRoleName(role.name)) {
        current.alternate = role;
      } else {
        current.main = role;
      }

      groupedRoles.set(key, current);
    }

    const participants: NormalizedEventParticipantInput[] = [];
    const seen = new Set<string>();

    for (const [roleKey, roleSet] of groupedRoles.entries()) {
      const selectedRole =
        castNumber === 2
          ? roleSet.alternate ?? roleSet.main
          : roleSet.main ?? roleSet.alternate;

      if (!selectedRole) {
        continue;
      }

      for (const assignment of selectedRole.assignments) {
        if (seen.has(assignment.participantId)) {
          continue;
        }

        seen.add(assignment.participantId);
        participants.push({
          participantId: assignment.participantId,
          templateRoleId: selectedRole.id,
          roleName: getBaseCastRoleName(selectedRole.name) || roleKey,
          attendanceStatus: EventAttendanceStatus.INVITED,
          isRequired: true,
          notes: null,
        });
      }
    }

    return this.ensureParticipantsExist(
      organizationId,
      participants.map((participant) => participant.participantId),
    ).then(() => participants);
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

  private getDayBounds(anchor: Date) {
    const start = new Date(anchor);
    start.setHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    return {
      start,
      end,
    };
  }

  private async resolvePerformanceCast(params: {
    organizationId: string;
    type: EventType;
    templateId: string | null;
    startsAt: Date;
    excludeEventId?: string;
    requestedCastNumber?: number | null;
    useAutomatic?: boolean;
    recalculateAutomatically?: boolean;
    existingCastNumber?: number | null;
    existingCastLocked?: boolean;
  }): Promise<ResolvedPerformanceCast> {
    if (params.type !== EventType.PERFORMANCE || !params.templateId) {
      return {
        castNumber: null,
        castLocked: false,
        templateRoles: [],
        hasAlternateCast: false,
      };
    }

    const templateRoles = await this.loadTemplateRoles(
      params.organizationId,
      params.templateId,
    );
    const hasAlternateCast = this.hasAlternateCastRoles(templateRoles);

    if (!hasAlternateCast) {
      return {
        castNumber: null,
        castLocked: false,
        templateRoles,
        hasAlternateCast: false,
      };
    }

    if (params.requestedCastNumber === 1 || params.requestedCastNumber === 2) {
      return {
        castNumber: params.requestedCastNumber,
        castLocked: true,
        templateRoles,
        hasAlternateCast: true,
      };
    }

    if (
      params.useAutomatic !== true &&
      params.existingCastLocked &&
      (params.existingCastNumber === 1 || params.existingCastNumber === 2)
    ) {
      return {
        castNumber: params.existingCastNumber as 1 | 2,
        castLocked: true,
        templateRoles,
        hasAlternateCast: true,
      };
    }

    if (
      !params.recalculateAutomatically &&
      params.useAutomatic !== true &&
      (params.existingCastNumber === 1 || params.existingCastNumber === 2)
    ) {
      return {
        castNumber: params.existingCastNumber as 1 | 2,
        castLocked: params.existingCastLocked ?? false,
        templateRoles,
        hasAlternateCast: true,
      };
    }

    const automaticCast = await this.resolveAutomaticPerformanceCast({
      organizationId: params.organizationId,
      templateId: params.templateId,
      startsAt: params.startsAt,
      excludeEventId: params.excludeEventId,
    });

    return {
      castNumber: automaticCast,
      castLocked: false,
      templateRoles,
      hasAlternateCast: true,
    };
  }

  private async resolveAutomaticPerformanceCast(params: {
    organizationId: string;
    templateId: string;
    startsAt: Date;
    excludeEventId?: string;
  }): Promise<1 | 2> {
    const { start, end } = this.getDayBounds(params.startsAt);

    const sameDayEvent = await this.prisma.event.findFirst({
      where: {
        organizationId: params.organizationId,
        templateId: params.templateId,
        type: EventType.PERFORMANCE,
        deletedAt: null,
        startsAt: {
          gte: start,
          lt: end,
        },
        status: {
          not: EventStatus.CANCELLED,
        },
        ...(params.excludeEventId ? { id: { not: params.excludeEventId } } : {}),
      },
      orderBy: [{ startsAt: 'asc' }, { createdAt: 'asc' }],
      select: {
        performanceCastNumber: true,
      },
    });

    if (sameDayEvent?.performanceCastNumber === 1 || sameDayEvent?.performanceCastNumber === 2) {
      return sameDayEvent.performanceCastNumber;
    }

    const previousEvent = await this.prisma.event.findFirst({
      where: {
        organizationId: params.organizationId,
        templateId: params.templateId,
        type: EventType.PERFORMANCE,
        deletedAt: null,
        startsAt: {
          lt: start,
        },
        status: {
          not: EventStatus.CANCELLED,
        },
        ...(params.excludeEventId ? { id: { not: params.excludeEventId } } : {}),
      },
      orderBy: [{ startsAt: 'desc' }, { createdAt: 'desc' }],
      select: {
        performanceCastNumber: true,
      },
    });

    return previousEvent?.performanceCastNumber === 1 ? 2 : 1;
  }

  private async syncPerformanceCastForDay(
    tx: Prisma.TransactionClient,
    params: {
      organizationId: string;
      templateId: string;
      startsAt: Date;
      castNumber: 1 | 2;
      castLocked: boolean;
      actorUserId: string;
      templateRoles: TemplateRoleRecord[];
    },
  ) {
    const { start, end } = this.getDayBounds(params.startsAt);
    const participants = await this.buildParticipantsFromTemplateRoles(
      params.organizationId,
      params.templateRoles,
      params.castNumber,
    );

    const sameDayEvents = await tx.event.findMany({
      where: {
        organizationId: params.organizationId,
        templateId: params.templateId,
        type: EventType.PERFORMANCE,
        deletedAt: null,
        startsAt: {
          gte: start,
          lt: end,
        },
      },
      select: {
        id: true,
      },
    });

    for (const event of sameDayEvents) {
      await tx.event.update({
        where: {
          id: event.id,
        },
        data: {
          performanceCastNumber: params.castNumber,
          performanceCastLocked: params.castLocked,
          updatedByUserId: params.actorUserId,
        },
      });

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
    }
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

  private extractLinkedUserIds(
    participants: Array<{
      participant?: {
        userId: string | null;
      } | null;
    }>,
  ): string[] {
    return this.mergeUserIds(
      participants
        .map((item) => item.participant?.userId ?? null)
        .filter((userId): userId is string => typeof userId === 'string' && userId.length > 0),
    );
  }

  private extractLinkedUserIdsFromEvents(
    events: Array<{
      participants: Array<{
        participant?: {
          userId: string | null;
        } | null;
      }>;
    }>,
  ): string[] {
    return this.mergeUserIds(
      ...events.map((event) => this.extractLinkedUserIds(event.participants)),
    );
  }

  private mergeUserIds(...groups: string[][]): string[] {
    return Array.from(
      new Set(
        groups.flatMap((items) => items).filter((userId) => userId.length > 0),
      ),
    );
  }

  private toEventNotificationSnapshot(event: {
    id: string;
    title: string;
    startsAt: Date;
    endsAt?: Date;
    type: EventType;
    status: EventStatus;
    location: string | null;
  }): EventNotificationSnapshot {
    return {
      id: event.id,
      title: event.title,
      startsAt: event.startsAt,
      endsAt: event.endsAt ?? event.startsAt,
      type: event.type,
      status: event.status,
      location: event.location,
    };
  }

  private normalizeChecklistItems(
    items: Array<{
      label: string;
      category?: string;
      notes?: string;
      sortOrder?: number;
      isCompleted?: boolean;
    }> = [],
  ) {
    return items
      .map((item, index) => ({
        label: this.requireTrimmedText(item.label, `checklistItems[${index}].label`, 1).slice(0, 160),
        category: this.trimOrNull(item.category),
        notes: this.trimOrNull(item.notes),
        sortOrder: typeof item.sortOrder === 'number' ? Math.max(0, Math.trunc(item.sortOrder)) : index,
        isCompleted: item.isCompleted === true,
      }))
      .sort((left, right) => left.sortOrder - right.sortOrder);
  }

  private buildEventChangePayload(
    existing: {
      title: string;
      type: EventType;
      status: EventStatus;
      startsAt: Date;
      endsAt: Date;
      assemblyAt?: Date | null;
      location?: string | null;
    },
    next: {
      title?: string;
      description?: string;
      type?: EventType;
      status?: EventStatus;
      startsAt?: Date;
      endsAt?: Date;
      assemblyAt?: Date | null;
      location?: string | null;
      participantsCount?: number;
      checklistItemsCount?: number;
    },
  ) {
    const changedFields: string[] = [];

    if (next.title !== undefined && next.title !== existing.title) changedFields.push('title');
    if (next.type !== undefined && next.type !== existing.type) changedFields.push('type');
    if (next.status !== undefined && next.status !== existing.status) changedFields.push('status');
    if (next.startsAt && next.startsAt.getTime() !== existing.startsAt.getTime()) changedFields.push('startsAt');
    if (next.endsAt && next.endsAt.getTime() !== existing.endsAt.getTime()) changedFields.push('endsAt');
    if ((next.assemblyAt ?? null)?.getTime?.() !== (existing.assemblyAt ?? null)?.getTime?.() && next.assemblyAt !== undefined) changedFields.push('assemblyAt');
    if (next.location !== undefined && next.location !== (existing.location ?? null)) changedFields.push('location');
    if (next.participantsCount !== undefined) changedFields.push('participants');
    if (next.checklistItemsCount !== undefined) changedFields.push('checklist');

    return {
      ...next,
      changedFields,
    };
  }

  private buildEventChangeSummary(
    previousEvent: {
      title: string;
      startsAt: Date;
      endsAt: Date;
      location: string | null;
      participants?: Array<unknown>;
      checklistItems?: Array<unknown>;
    },
    nextEvent: {
      title: string;
      startsAt: Date;
      endsAt: Date;
      location: string | null;
      participants?: Array<unknown>;
      checklistItems?: Array<unknown>;
    },
    options?: {
      participantsChanged?: boolean;
      checklistChanged?: boolean;
    },
  ): EventChangeSummary {
    const changedFields: string[] = [];

    if (previousEvent.title !== nextEvent.title) changedFields.push('название');
    if (previousEvent.startsAt.getTime() !== nextEvent.startsAt.getTime()) changedFields.push('время начала');
    if (previousEvent.endsAt.getTime() !== nextEvent.endsAt.getTime()) changedFields.push('время окончания');
    if ((previousEvent.location ?? '') !== (nextEvent.location ?? '')) changedFields.push('площадка');
    if (options?.participantsChanged) changedFields.push('состав');
    if (options?.checklistChanged) changedFields.push('чек-лист');

    const urgent =
      previousEvent.startsAt.getTime() !== nextEvent.startsAt.getTime() ||
      previousEvent.endsAt.getTime() !== nextEvent.endsAt.getTime() ||
      (previousEvent.location ?? '') !== (nextEvent.location ?? '');

    return {
      changedFields,
      urgent,
      checklistChanged: options?.checklistChanged ?? false,
    };
  }

  private buildScheduleNotificationDedupeKey(input: {
    event: EventNotificationSnapshot;
    actorUserId: string;
    previousEvent?: EventNotificationSnapshot;
    variant: string;
    changeSummary?: EventChangeSummary;
  }) {
    return createHash('sha256')
      .update(
        JSON.stringify({
          eventId: input.event.id,
          actorUserId: input.actorUserId,
          variant: input.variant,
          startsAt: input.event.startsAt.toISOString(),
          endsAt: input.event.endsAt.toISOString(),
          status: input.event.status,
          location: input.event.location,
          previousStartsAt: input.previousEvent?.startsAt.toISOString(),
          previousEndsAt: input.previousEvent?.endsAt.toISOString(),
          previousStatus: input.previousEvent?.status,
          previousLocation: input.previousEvent?.location,
          changedFields: input.changeSummary?.changedFields ?? [],
        }),
      )
      .digest('hex');
  }

  private getWeekBounds(anchor: Date) {
    const start = new Date(anchor);
    start.setHours(0, 0, 0, 0);

    const day = start.getDay();
    const mondayShift = day === 0 ? -6 : 1 - day;
    start.setDate(start.getDate() + mondayShift);

    const end = new Date(start);
    end.setDate(end.getDate() + 7);

    return {
      start,
      end,
    };
  }

  private isCurrentWeekEvent(startsAt: Date) {
    const { start, end } = this.getWeekBounds(new Date());
    return startsAt >= start && startsAt < end;
  }

  private formatWeekRangeLabel(startsAt: Date) {
    const { start, end } = this.getWeekBounds(startsAt);
    const weekEnd = new Date(end);
    weekEnd.setDate(weekEnd.getDate() - 1);

    return `${eventNotificationWeekDateFormat.format(start)} — ${eventNotificationWeekDateFormat.format(weekEnd)}`;
  }

  private getEventNotificationSummary(event: EventNotificationSnapshot): string {
    const parts = [
      `${eventTypeLabelMap[event.type]} «${event.title}»`,
      eventNotificationDateTimeFormat.format(event.startsAt),
    ];

    if (event.location) {
      parts.push(event.location);
    }

    return parts.join(' • ');
  }

  private buildEventNotificationPayload(
    event: EventNotificationSnapshot,
    url = `/calendar?eventId=${event.id}`,
    changedFields: string[] = [],
    urgent = false,
  ): Record<string, unknown> {
    return {
      eventId: event.id,
      eventTitle: event.title,
      startsAt: event.startsAt.toISOString(),
      endsAt: event.endsAt.toISOString(),
      type: event.type,
      status: event.status,
      location: event.location,
      changedFields,
      urgent,
      url,
      tag: `schedule-${event.id}`,
    };
  }

  private buildScheduleNotificationMessage(input: {
    event: EventNotificationSnapshot;
    previousEvent?: EventNotificationSnapshot;
    changeSummary?: EventChangeSummary;
    variant:
      | 'assigned'
      | 'updated'
      | 'participants'
      | 'cancelled'
      | 'removed'
      | 'draft'
      | 'replacement';
  }) {
    const summary = this.getEventNotificationSummary(input.event);
    const previousSummary = input.previousEvent
      ? this.getEventNotificationSummary(input.previousEvent)
      : null;
    const changedFields = input.changeSummary?.changedFields ?? [];
    const urgent = input.changeSummary?.urgent ?? input.variant === 'cancelled';
    const changeHint =
      changedFields.length > 0 ? ` Изменилось: ${changedFields.join(', ')}.` : '';

    switch (input.variant) {
      case 'assigned':
        return {
          type: NotificationType.EVENT_ASSIGNED,
          title: 'В расписании появилось новое событие',
          body: `${summary}. Проверьте детали и состав в календаре.`,
          url: `/calendar?eventId=${input.event.id}`,
        };
      case 'participants':
        return {
          type: urgent ? NotificationType.EVENT_URGENT_CHANGE : NotificationType.EVENT_UPDATED,
          title: 'Изменился состав события',
          body: `${summary}. Проверьте роли и участников в календаре.`,
          url: `/calendar?eventId=${input.event.id}`,
        };
      case 'cancelled':
        return {
          type: NotificationType.EVENT_URGENT_CHANGE,
          title: 'Событие отменено',
          body: `${summary}. Событие снято с актуальной недели.`,
          url: `/calendar?eventId=${input.event.id}`,
        };
      case 'removed':
        return {
          type: NotificationType.EVENT_UPDATED,
          title: 'Событие удалено из расписания',
          body: `«${input.event.title}» удалено из календаря. Проверьте актуальную неделю целиком.`,
          url: '/calendar',
        };
      case 'draft':
        return {
          type: NotificationType.EVENT_UPDATED,
          title: 'Событие снято с расписания',
          body: `«${input.event.title}» переведено в черновик и больше не активно в текущей неделе.`,
          url: '/calendar',
        };
      case 'replacement':
        return {
          type: NotificationType.EVENT_URGENT_CHANGE,
          title: 'В расписании замена спектакля',
          body: previousSummary
            ? `${previousSummary} заменено на ${summary}.`
            : `${summary}. Проверьте актуальную версию в календаре.`,
          url: `/calendar?eventId=${input.event.id}`,
        };
      case 'updated':
      default:
        return {
          type: urgent ? NotificationType.EVENT_URGENT_CHANGE : NotificationType.EVENT_UPDATED,
          title: 'Изменение в расписании на этой неделе',
          body:
            previousSummary && previousSummary !== summary
              ? `${previousSummary} обновлено. Теперь: ${summary}.`
              : `${summary}. Проверьте время, площадку и детали события.`,
          url: `/calendar?eventId=${input.event.id}`,
        };
    }
  }

  private async notifyScheduleChangeSafe(input: {
    organizationId: string;
    actorUserId: string;
    event: EventNotificationSnapshot;
    userIds: string[];
    previousEvent?: EventNotificationSnapshot;
    changeSummary?: EventChangeSummary;
    variant:
      | 'assigned'
      | 'updated'
      | 'participants'
      | 'cancelled'
      | 'removed'
      | 'draft'
      | 'replacement';
  }) {
    const touchesCurrentWeek =
      this.isCurrentWeekEvent(input.event.startsAt) ||
      (input.previousEvent ? this.isCurrentWeekEvent(input.previousEvent.startsAt) : false);

    if (input.userIds.length === 0 || !touchesCurrentWeek) {
      return;
    }

    const message = this.buildScheduleNotificationMessage({
      event: input.event,
      previousEvent: input.previousEvent,
      changeSummary: input.changeSummary,
      variant: input.variant,
    });

    try {
      await this.notificationsService.notifyUsers({
        organizationId: input.organizationId,
        eventId: input.event.id,
        actorUserId: input.actorUserId,
        dedupeKey: this.buildScheduleNotificationDedupeKey(input),
        type: message.type,
        title: message.title,
        body: message.body,
        payload: this.buildEventNotificationPayload(
          input.event,
          message.url,
          input.changeSummary?.changedFields,
          input.changeSummary?.urgent ?? false,
        ),
        userIds: input.userIds,
      });
    } catch (error) {
      this.logger.warn(
        `Failed to send schedule change notification for event=${input.event.id}: ${(error as Error).message}`,
      );
    }
  }

  private async notifyWeekSchedulePublishedSafe(input: {
    organizationId: string;
    actorUserId: string;
    startsAt: Date;
    publishedCount: number;
    userIds: string[];
  }) {
    if (input.userIds.length === 0) {
      return false;
    }

    try {
      await this.notificationsService.notifyUsers({
        organizationId: input.organizationId,
        actorUserId: input.actorUserId,
        type: NotificationType.SYSTEM,
        title: 'Новое расписание на неделю',
        body: `Опубликовано расписание на ${this.formatWeekRangeLabel(input.startsAt)}. В расписании ${input.publishedCount} ${this.pluralizeEvents(input.publishedCount)}.`,
        payload: {
          url: '/calendar',
          weekStart: this.getWeekBounds(input.startsAt).start.toISOString(),
          publishedCount: input.publishedCount,
        },
        userIds: input.userIds,
      });
      return true;
    } catch (error) {
      this.logger.warn(
        `Failed to send weekly schedule notification for organization=${input.organizationId}: ${(error as Error).message}`,
      );
      return false;
    }
  }

  private pluralizeEvents(count: number) {
    const mod10 = count % 10;
    const mod100 = count % 100;

    if (mod10 === 1 && mod100 !== 11) {
      return 'событие';
    }

    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
      return 'события';
    }

    return 'событий';
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

  private parseAssemblyAt(
    assemblyAtIso: string | null | undefined,
    startsAt: Date,
    eventType: EventType,
  ) {
    if (eventType !== EventType.TOUR) {
      return null;
    }

    if (!assemblyAtIso) {
      return null;
    }

    const assemblyAt = new Date(assemblyAtIso);

    if (Number.isNaN(assemblyAt.getTime())) {
      throw new BadRequestException('РќРµРєРѕСЂСЂРµРєС‚РЅРѕРµ РІСЂРµРјСЏ СЃР±РѕСЂР°');
    }

    if (assemblyAt.getTime() > startsAt.getTime()) {
      throw new BadRequestException('Р’СЂРµРјСЏ СЃР±РѕСЂР° РЅРµ РјРѕР¶РµС‚ Р±С‹С‚СЊ РїРѕР·Р¶Рµ РЅР°С‡Р°Р»Р° СЃРїРµРєС‚Р°РєР»СЏ');
    }

    return assemblyAt;
  }

  private formatReminderDateTime(date: Date, timezone: string): string {
    return new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: timezone,
    }).format(date);
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
