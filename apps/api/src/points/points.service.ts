import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditTargetType,
  EventAttendanceStatus,
  EventType,
  ManualPointsAuditAction,
  PointsComputationStatus,
  PointsLedgerType,
  Prisma,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

import { CreateManualPointsDto } from './dto/create-manual-points.dto';
import { DeleteManualPointsDto } from './dto/delete-manual-points.dto';
import { ListManualPointsQueryDto } from './dto/list-manual-points-query.dto';
import { PointsPeriodQueryDto } from './dto/points-period-query.dto';
import { RunAutoPointsForEventDto } from './dto/run-auto-points-for-event.dto';
import { UpdateManualPointsDto } from './dto/update-manual-points.dto';
import { UpdatePointsConfigDto } from './dto/update-points-config.dto';

const pointsConfigSelect = {
  id: true,
  organizationId: true,
  enabled: true,
  periodStartDay: true,
  performanceLongMinutes: true,
  performanceLongPoints: true,
  performanceShortPoints: true,
  rehearsalMinutesPerPoint: true,
  autoLockDays: true,
  updatedByUserId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.PointsConfigSelect;

const manualAllowedTypes = new Set<PointsLedgerType>([
  PointsLedgerType.MANUAL_ADJUSTMENT,
  PointsLedgerType.CORRECTION,
  PointsLedgerType.BONUS,
  PointsLedgerType.PENALTY,
]);

type PeriodRange = {
  periodStart: Date;
  periodEnd: Date;
};

type PeriodParticipantReport = {
  participantId: string;
  participantName: string;
  autoPoints: string;
  manualPoints: string;
  totalPoints: string;
};

type PeriodEntryReport = {
  ledgerEntryId: string;
  participantId: string;
  participantName: string;
  eventId: string | null;
  eventTitle: string | null;
  type: PointsLedgerType;
  points: string;
  description: string | null;
  createdAt: string;
  periodStart: string;
  periodEnd: string;
};

type PeriodSummaryReport = {
  totals: {
    autoPoints: string;
    manualPoints: string;
    totalPoints: string;
  };
  participants: PeriodParticipantReport[];
  entries: PeriodEntryReport[];
  entriesCount: number;
};

@Injectable()
export class PointsService {
  constructor(private readonly prisma: PrismaService) {}

  async getPointsConfig(organizationId: string) {
    return this.ensurePointsConfig(organizationId);
  }

  async updatePointsConfig(
    organizationId: string,
    actorUserId: string,
    dto: UpdatePointsConfigDto,
  ) {
    const currentConfig = await this.ensurePointsConfig(organizationId);

    const data: Prisma.PointsConfigUncheckedUpdateInput = {
      enabled: dto.enabled,
      periodStartDay: dto.periodStartDay,
      performanceLongMinutes: dto.performanceLongMinutes,
      rehearsalMinutesPerPoint: dto.rehearsalMinutesPerPoint,
      autoLockDays: dto.autoLockDays,
      updatedByUserId: actorUserId,
    };

    if (dto.performanceLongPoints !== undefined) {
      data.performanceLongPoints = this.parseNonNegativeDecimal(
        dto.performanceLongPoints,
        'performanceLongPoints',
      );
    }

    if (dto.performanceShortPoints !== undefined) {
      data.performanceShortPoints = this.parseNonNegativeDecimal(
        dto.performanceShortPoints,
        'performanceShortPoints',
      );
    }

    const updatedConfig = await this.prisma.pointsConfig.update({
      where: {
        organizationId,
      },
      data,
      select: pointsConfigSelect,
    });

    await this.prisma.auditLog.create({
      data: {
        organizationId,
        actorUserId,
        targetType: AuditTargetType.POINTS,
        targetId: updatedConfig.id,
        action: 'points.config.updated',
        description: 'Points config updated',
        payload: this.toAuditPayload({
          before: {
            enabled: currentConfig.enabled,
            periodStartDay: currentConfig.periodStartDay,
            performanceLongMinutes: currentConfig.performanceLongMinutes,
            performanceLongPoints: currentConfig.performanceLongPoints.toString(),
            performanceShortPoints: currentConfig.performanceShortPoints.toString(),
            rehearsalMinutesPerPoint: currentConfig.rehearsalMinutesPerPoint,
            autoLockDays: currentConfig.autoLockDays,
          },
          after: {
            enabled: updatedConfig.enabled,
            periodStartDay: updatedConfig.periodStartDay,
            performanceLongMinutes: updatedConfig.performanceLongMinutes,
            performanceLongPoints: updatedConfig.performanceLongPoints.toString(),
            performanceShortPoints: updatedConfig.performanceShortPoints.toString(),
            rehearsalMinutesPerPoint: updatedConfig.rehearsalMinutesPerPoint,
            autoLockDays: updatedConfig.autoLockDays,
          },
        }),
      },
    });

    return updatedConfig;
  }

  async getPeriod(organizationId: string, query: PointsPeriodQueryDto) {
    const config = await this.ensurePointsConfig(organizationId);
    const referenceDate = this.parseReferenceDate(query.referenceDate);
    const period = this.buildPeriodRange(referenceDate, config.periodStartDay);

    return {
      periodStart: period.periodStart.toISOString(),
      periodEnd: period.periodEnd.toISOString(),
      referenceDate: referenceDate.toISOString(),
      periodStartDay: config.periodStartDay,
    };
  }

  private async buildPeriodSummary(
    organizationId: string,
    period: PeriodRange,
    participantId?: string,
  ): Promise<PeriodSummaryReport> {
    const entries = await this.prisma.pointsLedgerEntry.findMany({
      where: {
        organizationId,
        participantId,
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        reversedAt: null,
      },
      select: {
        id: true,
        participantId: true,
        eventId: true,
        type: true,
        points: true,
        description: true,
        createdAt: true,
        periodStart: true,
        periodEnd: true,
        event: {
          select: {
            title: true,
          },
        },
        participant: {
          select: {
            firstName: true,
            lastName: true,
            displayName: true,
          },
        },
      },
      orderBy: [{ createdAt: 'asc' }],
    });

    const totals = {
      autoPoints: new Prisma.Decimal(0),
      manualPoints: new Prisma.Decimal(0),
      totalPoints: new Prisma.Decimal(0),
    };

    const byParticipant = new Map<
      string,
      {
        participantId: string;
        participantName: string;
        autoPoints: Prisma.Decimal;
        manualPoints: Prisma.Decimal;
        totalPoints: Prisma.Decimal;
      }
    >();

    const entryReport: PeriodEntryReport[] = [];

    for (const entry of entries) {
      const points = new Prisma.Decimal(entry.points).toDecimalPlaces(2);
      const isAuto = entry.type === PointsLedgerType.AUTO_EVENT;
      const participantName =
        entry.participant.displayName ??
        `${entry.participant.firstName} ${entry.participant.lastName}`.trim();

      totals.totalPoints = totals.totalPoints.plus(points);
      if (isAuto) {
        totals.autoPoints = totals.autoPoints.plus(points);
      } else {
        totals.manualPoints = totals.manualPoints.plus(points);
      }

      const existing = byParticipant.get(entry.participantId) ?? {
        participantId: entry.participantId,
        participantName,
        autoPoints: new Prisma.Decimal(0),
        manualPoints: new Prisma.Decimal(0),
        totalPoints: new Prisma.Decimal(0),
      };

      existing.totalPoints = existing.totalPoints.plus(points);
      if (isAuto) {
        existing.autoPoints = existing.autoPoints.plus(points);
      } else {
        existing.manualPoints = existing.manualPoints.plus(points);
      }
      byParticipant.set(entry.participantId, existing);

      entryReport.push({
        ledgerEntryId: entry.id,
        participantId: entry.participantId,
        participantName,
        eventId: entry.eventId,
        eventTitle: entry.event?.title ?? null,
        type: entry.type,
        points: points.toFixed(2),
        description: entry.description,
        createdAt: entry.createdAt.toISOString(),
        periodStart: entry.periodStart.toISOString(),
        periodEnd: entry.periodEnd.toISOString(),
      });
    }

    const participantReport: PeriodParticipantReport[] = Array.from(byParticipant.values())
      .sort((left, right) => left.participantName.localeCompare(right.participantName))
      .map((participant) => ({
        participantId: participant.participantId,
        participantName: participant.participantName,
        autoPoints: participant.autoPoints.toFixed(2),
        manualPoints: participant.manualPoints.toFixed(2),
        totalPoints: participant.totalPoints.toFixed(2),
      }));

    return {
      totals: {
        autoPoints: totals.autoPoints.toFixed(2),
        manualPoints: totals.manualPoints.toFixed(2),
        totalPoints: totals.totalPoints.toFixed(2),
      },
      participants: participantReport,
      entries: entryReport,
      entriesCount: entries.length,
    };
  }

  async getPeriodSummary(organizationId: string, query: PointsPeriodQueryDto) {
    const config = await this.ensurePointsConfig(organizationId);
    const referenceDate = this.parseReferenceDate(query.referenceDate);
    const period = this.buildPeriodRange(referenceDate, config.periodStartDay);
    const report = await this.buildPeriodSummary(organizationId, period, query.participantId);

    return {
      periodStart: period.periodStart.toISOString(),
      periodEnd: period.periodEnd.toISOString(),
      referenceDate: referenceDate.toISOString(),
      periodStartDay: config.periodStartDay,
      totals: report.totals,
      participants: report.participants,
      entriesCount: report.entriesCount,
      entries: report.entries,
    };
  }

  async runAutoPointsForEvent(
    organizationId: string,
    eventId: string,
    actorUserId: string,
    dto: RunAutoPointsForEventDto,
  ) {
    const config = await this.ensurePointsConfig(organizationId);
    this.ensurePointsEnabled(config);

    const event = await this.prisma.event.findFirst({
      where: {
        id: eventId,
        organizationId,
        deletedAt: null,
      },
      select: {
        id: true,
        title: true,
        type: true,
        status: true,
        startsAt: true,
        endsAt: true,
        durationMinutes: true,
        participants: {
          where: {
            participant: {
              deletedAt: null,
            },
          },
          select: {
            id: true,
            participantId: true,
            attendanceStatus: true,
          },
        },
      },
    });

    if (!event) {
      throw new NotFoundException('Событие не найдено');
    }

    if (event.status === 'CANCELLED') {
      throw new ConflictException('Нельзя рассчитать баллы для отмененного события');
    }

    const period = this.buildPeriodRange(event.startsAt, config.periodStartDay);
    const rule = this.resolveAutoRule(event.type, event.durationMinutes, config);

    if (rule.points.lte(0)) {
      throw new BadRequestException('Для этого типа события правило автобаллов недоступно');
    }

    const eligibleParticipants = event.participants.filter(
      (participant) =>
        participant.attendanceStatus !== EventAttendanceStatus.DECLINED &&
        participant.attendanceStatus !== EventAttendanceStatus.ABSENT,
    );

    const now = new Date();

    const result = await this.prisma.$transaction(async (tx) => {
      const existingEntriesCount = await tx.pointsLedgerEntry.count({
        where: {
          organizationId,
          eventId: event.id,
          type: PointsLedgerType.AUTO_EVENT,
          periodStart: period.periodStart,
          periodEnd: period.periodEnd,
          reversedAt: null,
        },
      });

      if (dto.forceRecompute === false && existingEntriesCount > 0) {
        return {
          reused: true as const,
          entriesCount: existingEntriesCount,
        };
      }

      await tx.pointsLedgerEntry.updateMany({
        where: {
          organizationId,
          eventId: event.id,
          type: PointsLedgerType.AUTO_EVENT,
          periodStart: period.periodStart,
          periodEnd: period.periodEnd,
          reversedAt: null,
        },
        data: {
          reversedAt: now,
          computationStatus: PointsComputationStatus.VOID,
        },
      });

      const run = await tx.autoPointsComputation.create({
        data: {
          organizationId,
          eventId: event.id,
          runByUserId: actorUserId,
          status: PointsComputationStatus.CALCULATED,
          startedAt: now,
          metadata: this.toAuditPayload({
            rule: rule.rule,
            pointsPerParticipant: rule.points.toFixed(2),
            participantsInEvent: event.participants.length,
            eligibleParticipants: eligibleParticipants.length,
          }),
        },
        select: {
          id: true,
        },
      });

      if (eligibleParticipants.length > 0) {
        await tx.pointsLedgerEntry.createMany({
          data: eligibleParticipants.map((participant) => ({
            organizationId,
            participantId: participant.participantId,
            eventId: event.id,
            eventParticipantId: participant.id,
            autoComputationId: run.id,
            periodStart: period.periodStart,
            periodEnd: period.periodEnd,
            type: PointsLedgerType.AUTO_EVENT,
            computationStatus: PointsComputationStatus.CALCULATED,
            points: rule.points,
            description: `Auto points for ${event.title}`,
            metadata: this.toAuditPayload({
              eventType: event.type,
              rule: rule.rule,
            }),
            createdByUserId: actorUserId,
          })),
        });
      }

      const generatedPoints = rule.points.mul(eligibleParticipants.length);

      await tx.autoPointsComputation.update({
        where: {
          id: run.id,
        },
        data: {
          finishedAt: new Date(),
          generatedEntriesCount: eligibleParticipants.length,
          generatedPoints,
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId,
          targetType: AuditTargetType.POINTS,
          targetId: run.id,
          action: 'points.auto.computed',
          description: 'Auto points computed for event',
          payload: this.toAuditPayload({
            eventId: event.id,
            eventTitle: event.title,
            periodStart: period.periodStart.toISOString(),
            periodEnd: period.periodEnd.toISOString(),
            rule: rule.rule,
            pointsPerParticipant: rule.points.toFixed(2),
            generatedEntriesCount: eligibleParticipants.length,
            generatedPoints: generatedPoints.toFixed(2),
          }),
        },
      });

      return {
        reused: false as const,
        runId: run.id,
        generatedEntriesCount: eligibleParticipants.length,
        generatedPoints: generatedPoints.toFixed(2),
      };
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });

    if (result.reused) {
      return {
        reused: true,
        eventId: event.id,
        periodStart: period.periodStart.toISOString(),
        periodEnd: period.periodEnd.toISOString(),
        entriesCount: result.entriesCount,
      };
    }

    const { reused: _reused, ...computedResult } = result;

    return {
      reused: false,
      eventId: event.id,
      periodStart: period.periodStart.toISOString(),
      periodEnd: period.periodEnd.toISOString(),
      rule: rule.rule,
      pointsPerParticipant: rule.points.toFixed(2),
      ...computedResult,
    };
  }

  async listManualPoints(organizationId: string, query: ListManualPointsQueryDto) {
    const config = await this.ensurePointsConfig(organizationId);
    const referenceDate = this.parseReferenceDate(query.referenceDate);
    const period = this.buildPeriodRange(referenceDate, config.periodStartDay);

    const adjustments = await this.prisma.manualPointsAdjustment.findMany({
      where: {
        organizationId,
        participantId: query.participantId,
        deletedAt: null,
        ledgerEntry: {
          periodStart: period.periodStart,
          periodEnd: period.periodEnd,
          reversedAt: null,
        },
      },
      select: {
        id: true,
        participantId: true,
        reason: true,
        createdAt: true,
        updatedAt: true,
        performedByUserId: true,
        ledgerEntry: {
          select: {
            id: true,
            type: true,
            points: true,
            description: true,
            periodStart: true,
            periodEnd: true,
            createdAt: true,
            reversedAt: true,
          },
        },
        participant: {
          select: {
            firstName: true,
            lastName: true,
            displayName: true,
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }],
      take: query.limit ?? 200,
    });

    return {
      periodStart: period.periodStart.toISOString(),
      periodEnd: period.periodEnd.toISOString(),
      items: adjustments.map((item) => ({
        id: item.id,
        participantId: item.participantId,
        participantName:
          item.participant.displayName ??
          `${item.participant.firstName} ${item.participant.lastName}`.trim(),
        type: item.ledgerEntry.type,
        points: item.ledgerEntry.points.toFixed(2),
        reason: item.reason,
        description: item.ledgerEntry.description,
        ledgerEntryId: item.ledgerEntry.id,
        performedByUserId: item.performedByUserId,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })),
    };
  }

  async createManualPoints(
    organizationId: string,
    actorUserId: string,
    dto: CreateManualPointsDto,
  ) {
    const config = await this.ensurePointsConfig(organizationId);
    this.ensurePointsEnabled(config);

    const participant = await this.ensureParticipantExists(organizationId, dto.participantId);
    const type = this.resolveManualType(dto.type);
    const points = this.normalizeManualPoints(dto.points, type);
    const reason = dto.reason.trim();

    if (reason.length < 3) {
      throw new BadRequestException('Поле reason обязательно');
    }

    if (points.eq(0)) {
      throw new BadRequestException('Количество баллов не может быть равно 0');
    }

    if (dto.eventId) {
      await this.ensureEventExists(organizationId, dto.eventId);
    }

    const referenceDate = this.parseReferenceDate(dto.occurredAt);
    const period = this.buildPeriodRange(referenceDate, config.periodStartDay);

    const result = await this.prisma.$transaction(async (tx) => {
      const ledgerEntry = await tx.pointsLedgerEntry.create({
        data: {
          organizationId,
          participantId: participant.id,
          eventId: dto.eventId,
          periodStart: period.periodStart,
          periodEnd: period.periodEnd,
          type,
          computationStatus: PointsComputationStatus.CALCULATED,
          points,
          description: reason,
          createdByUserId: actorUserId,
          metadata: this.toAuditPayload({
            source: 'manual',
            occurredAt: referenceDate.toISOString(),
          }),
        },
        select: {
          id: true,
          points: true,
          type: true,
          periodStart: true,
          periodEnd: true,
          description: true,
          createdAt: true,
        },
      });

      const adjustment = await tx.manualPointsAdjustment.create({
        data: {
          organizationId,
          ledgerEntryId: ledgerEntry.id,
          participantId: participant.id,
          performedByUserId: actorUserId,
          reason,
        },
        select: {
          id: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      await tx.manualPointsAudit.create({
        data: {
          organizationId,
          manualAdjustmentId: adjustment.id,
          ledgerEntryId: ledgerEntry.id,
          action: ManualPointsAuditAction.CREATED,
          performedByUserId: actorUserId,
          reason,
          oldData: Prisma.JsonNull,
          newData: this.toAuditPayload({
            points: ledgerEntry.points.toFixed(2),
            type: ledgerEntry.type,
            description: ledgerEntry.description,
            periodStart: ledgerEntry.periodStart.toISOString(),
            periodEnd: ledgerEntry.periodEnd.toISOString(),
          }),
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId,
          targetType: AuditTargetType.MANUAL_POINTS,
          targetId: adjustment.id,
          action: 'points.manual.created',
          description: 'Manual points created',
          payload: this.toAuditPayload({
            adjustmentId: adjustment.id,
            ledgerEntryId: ledgerEntry.id,
            participantId: participant.id,
            points: ledgerEntry.points.toFixed(2),
            type: ledgerEntry.type,
            reason,
          }),
        },
      });

      return {
        adjustmentId: adjustment.id,
        ledgerEntryId: ledgerEntry.id,
        participantId: participant.id,
        participantName:
          participant.displayName ?? `${participant.firstName} ${participant.lastName}`.trim(),
        points: ledgerEntry.points.toFixed(2),
        type: ledgerEntry.type,
        reason,
        periodStart: ledgerEntry.periodStart.toISOString(),
        periodEnd: ledgerEntry.periodEnd.toISOString(),
        createdAt: adjustment.createdAt,
      };
    });

    return result;
  }

  async updateManualPoints(
    organizationId: string,
    adjustmentId: string,
    actorUserId: string,
    dto: UpdateManualPointsDto,
  ) {
    const config = await this.ensurePointsConfig(organizationId);
    this.ensurePointsEnabled(config);

    const reason = dto.reason.trim();

    if (reason.length < 3) {
      throw new BadRequestException('Поле reason обязательно');
    }

    const adjustment = await this.prisma.manualPointsAdjustment.findFirst({
      where: {
        id: adjustmentId,
        organizationId,
      },
      select: {
        id: true,
        participantId: true,
        reason: true,
        deletedAt: true,
        ledgerEntry: {
          select: {
            id: true,
            type: true,
            points: true,
            description: true,
            periodStart: true,
            periodEnd: true,
            reversedAt: true,
          },
        },
      },
    });

    if (!adjustment) {
      throw new NotFoundException('Ручная корректировка баллов не найдена');
    }

    if (adjustment.deletedAt || adjustment.ledgerEntry.reversedAt) {
      throw new ConflictException('Ручная корректировка баллов уже удалена');
    }

    const nextType = this.resolveManualType(dto.type ?? adjustment.ledgerEntry.type);
    const nextPoints =
      dto.points !== undefined
        ? this.normalizeManualPoints(dto.points, nextType)
        : new Prisma.Decimal(adjustment.ledgerEntry.points);

    if (nextPoints.eq(0)) {
      throw new BadRequestException('Количество баллов не может быть равно 0');
    }

    const period = dto.occurredAt
      ? this.buildPeriodRange(this.parseReferenceDate(dto.occurredAt), config.periodStartDay)
      : {
          periodStart: adjustment.ledgerEntry.periodStart,
          periodEnd: adjustment.ledgerEntry.periodEnd,
        };

    const oldData = {
      points: new Prisma.Decimal(adjustment.ledgerEntry.points).toFixed(2),
      type: adjustment.ledgerEntry.type,
      description: adjustment.ledgerEntry.description,
      periodStart: adjustment.ledgerEntry.periodStart.toISOString(),
      periodEnd: adjustment.ledgerEntry.periodEnd.toISOString(),
      reason: adjustment.reason,
    };

    const updated = await this.prisma.$transaction(async (tx) => {
      const ledgerEntry = await tx.pointsLedgerEntry.update({
        where: {
          id: adjustment.ledgerEntry.id,
        },
        data: {
          type: nextType,
          points: nextPoints,
          description: reason,
          periodStart: period.periodStart,
          periodEnd: period.periodEnd,
        },
        select: {
          id: true,
          points: true,
          type: true,
          description: true,
          periodStart: true,
          periodEnd: true,
        },
      });

      await tx.manualPointsAdjustment.update({
        where: {
          id: adjustment.id,
        },
        data: {
          reason,
        },
      });

      const newData = {
        points: ledgerEntry.points.toFixed(2),
        type: ledgerEntry.type,
        description: ledgerEntry.description,
        periodStart: ledgerEntry.periodStart.toISOString(),
        periodEnd: ledgerEntry.periodEnd.toISOString(),
        reason,
      };

      await tx.manualPointsAudit.create({
        data: {
          organizationId,
          manualAdjustmentId: adjustment.id,
          ledgerEntryId: ledgerEntry.id,
          action: ManualPointsAuditAction.UPDATED,
          performedByUserId: actorUserId,
          reason,
          oldData: this.toAuditPayload(oldData),
          newData: this.toAuditPayload(newData),
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId,
          targetType: AuditTargetType.MANUAL_POINTS,
          targetId: adjustment.id,
          action: 'points.manual.updated',
          description: 'Manual points updated',
          payload: this.toAuditPayload({
            adjustmentId: adjustment.id,
            ledgerEntryId: ledgerEntry.id,
            oldData,
            newData,
          }),
        },
      });

      return {
        adjustmentId: adjustment.id,
        ledgerEntryId: ledgerEntry.id,
        participantId: adjustment.participantId,
        points: ledgerEntry.points.toFixed(2),
        type: ledgerEntry.type,
        reason,
        periodStart: ledgerEntry.periodStart.toISOString(),
        periodEnd: ledgerEntry.periodEnd.toISOString(),
      };
    });

    return updated;
  }

  async deleteManualPoints(
    organizationId: string,
    adjustmentId: string,
    actorUserId: string,
    dto: DeleteManualPointsDto,
  ) {
    const config = await this.ensurePointsConfig(organizationId);
    this.ensurePointsEnabled(config);

    const reason = dto.reason.trim();

    if (reason.length < 3) {
      throw new BadRequestException('Поле reason обязательно');
    }

    const adjustment = await this.prisma.manualPointsAdjustment.findFirst({
      where: {
        id: adjustmentId,
        organizationId,
      },
      select: {
        id: true,
        participantId: true,
        deletedAt: true,
        ledgerEntry: {
          select: {
            id: true,
            points: true,
            type: true,
            description: true,
            periodStart: true,
            periodEnd: true,
            reversedAt: true,
          },
        },
      },
    });

    if (!adjustment) {
      throw new NotFoundException('Ручная корректировка баллов не найдена');
    }

    if (adjustment.deletedAt || adjustment.ledgerEntry.reversedAt) {
      return {
        success: true as const,
        alreadyDeleted: true as const,
      };
    }

    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.manualPointsAdjustment.update({
        where: {
          id: adjustment.id,
        },
        data: {
          deletedAt: now,
          reason,
        },
      });

      await tx.pointsLedgerEntry.update({
        where: {
          id: adjustment.ledgerEntry.id,
        },
        data: {
          reversedAt: now,
          computationStatus: PointsComputationStatus.VOID,
        },
      });

      await tx.manualPointsAudit.create({
        data: {
          organizationId,
          manualAdjustmentId: adjustment.id,
          ledgerEntryId: adjustment.ledgerEntry.id,
          action: ManualPointsAuditAction.DELETED,
          performedByUserId: actorUserId,
          reason,
          oldData: this.toAuditPayload({
            points: adjustment.ledgerEntry.points.toFixed(2),
            type: adjustment.ledgerEntry.type,
            description: adjustment.ledgerEntry.description,
            periodStart: adjustment.ledgerEntry.periodStart.toISOString(),
            periodEnd: adjustment.ledgerEntry.periodEnd.toISOString(),
          }),
          newData: Prisma.JsonNull,
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId,
          targetType: AuditTargetType.MANUAL_POINTS,
          targetId: adjustment.id,
          action: 'points.manual.deleted',
          description: 'Manual points deleted',
          payload: this.toAuditPayload({
            adjustmentId: adjustment.id,
            ledgerEntryId: adjustment.ledgerEntry.id,
            reason,
          }),
        },
      });
    });

    return {
      success: true as const,
      deletedAt: now.toISOString(),
    };
  }

  private async ensurePointsConfig(organizationId: string) {
    await this.ensureOrganizationExists(organizationId);

    return this.prisma.pointsConfig.upsert({
      where: {
        organizationId,
      },
      update: {},
      create: {
        organizationId,
        enabled: false,
        periodStartDay: 25,
        performanceLongMinutes: 60,
        performanceLongPoints: new Prisma.Decimal(3),
        performanceShortPoints: new Prisma.Decimal(2),
        rehearsalMinutesPerPoint: 180,
        autoLockDays: 7,
      },
      select: pointsConfigSelect,
    });
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

    return organization;
  }

  private async ensureParticipantExists(organizationId: string, participantId: string) {
    const participant = await this.prisma.participant.findFirst({
      where: {
        id: participantId,
        organizationId,
        deletedAt: null,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        displayName: true,
      },
    });

    if (!participant) {
      throw new NotFoundException('Участник не найден');
    }

    return participant;
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

    return event;
  }

  private ensurePointsEnabled(config: { enabled: boolean }) {
    if (!config.enabled) {
      throw new ConflictException('Система баллов отключена для этой организации');
    }
  }

  private resolveAutoRule(
    eventType: EventType,
    durationMinutes: number,
    config: {
      performanceLongMinutes: number;
      performanceLongPoints: Prisma.Decimal;
      performanceShortPoints: Prisma.Decimal;
      rehearsalMinutesPerPoint: number;
    },
  ) {
    if (eventType === EventType.PERFORMANCE) {
      const longPerformance = durationMinutes >= config.performanceLongMinutes;

      return {
        rule: longPerformance ? 'PERFORMANCE_LONG' : 'PERFORMANCE_SHORT',
        points: new Prisma.Decimal(
          longPerformance ? config.performanceLongPoints : config.performanceShortPoints,
        ).toDecimalPlaces(2),
      };
    }

    if (eventType === EventType.REHEARSAL) {
      const rawPoints = new Prisma.Decimal(durationMinutes).div(
        config.rehearsalMinutesPerPoint,
      );

      return {
        rule: 'REHEARSAL_RATIO',
        points: rawPoints.toDecimalPlaces(2),
      };
    }

    return {
      rule: 'UNSUPPORTED',
      points: new Prisma.Decimal(0),
    };
  }

  private resolveManualType(type?: PointsLedgerType): PointsLedgerType {
    const resolved = type ?? PointsLedgerType.MANUAL_ADJUSTMENT;

    if (!manualAllowedTypes.has(resolved)) {
      throw new BadRequestException('Неподдерживаемый тип ручных баллов');
    }

    return resolved;
  }

  private normalizeManualPoints(rawPoints: string, type: PointsLedgerType): Prisma.Decimal {
    let points = this.parseDecimal(rawPoints, 'points').toDecimalPlaces(2);

    if (type === PointsLedgerType.BONUS && points.lt(0)) {
      points = points.abs();
    }

    if (type === PointsLedgerType.PENALTY && points.gt(0)) {
      points = points.abs().negated();
    }

    return points;
  }

  private buildPeriodRange(referenceDate: Date, periodStartDay: number): PeriodRange {
    const ref = new Date(referenceDate);

    if (Number.isNaN(ref.getTime())) {
      throw new BadRequestException('Некорректная дата расчета');
    }

    const year = ref.getUTCFullYear();
    const month = ref.getUTCMonth();
    const day = ref.getUTCDate();
    const offset = day >= periodStartDay ? 0 : -1;

    const periodStart = new Date(
      Date.UTC(year, month + offset, periodStartDay, 0, 0, 0, 0),
    );
    const periodEnd = new Date(
      Date.UTC(year, month + offset + 1, periodStartDay, 0, 0, 0, 0),
    );

    return {
      periodStart,
      periodEnd,
    };
  }

  private parseReferenceDate(value?: string): Date {
    if (!value) {
      return new Date();
    }

    const parsed = new Date(value);

    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('Некорректный параметр referenceDate');
    }

    return parsed;
  }

  private parseNonNegativeDecimal(value: string, field: string): Prisma.Decimal {
    const parsed = this.parseDecimal(value, field);

    if (parsed.lt(0)) {
      throw new BadRequestException(`${field} не может быть отрицательным`);
    }

    return parsed;
  }

  private parseDecimal(value: string, field: string): Prisma.Decimal {
    try {
      return new Prisma.Decimal(value);
    } catch {
      throw new BadRequestException(`${field} должно быть корректным десятичным числом`);
    }
  }

  private toAuditPayload(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }
}
