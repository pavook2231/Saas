import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AuditTargetType,
  MembershipStatus,
  OrganizationInviteStatus,
  OrganizationRole,
  Prisma,
} from '@prisma/client';
import { createHash, randomBytes } from 'crypto';

import { AppConfig } from '../config/app.config';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

import { CreateOrganizationDto } from './dto/create-organization.dto';
import { CreateJoinRequestDto } from './dto/create-join-request.dto';
import { DiscoverOrganizationsQueryDto } from './dto/discover-organizations-query.dto';
import { InviteMembershipDto } from './dto/invite-membership.dto';
import { ReviewJoinRequestDto } from './dto/review-join-request.dto';
import { UpdateMembershipDto } from './dto/update-membership.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';

const organizationSelect = {
  id: true,
  name: true,
  slug: true,
  inviteCode: true,
  description: true,
  timezone: true,
  settings: true,
  createdByUserId: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} satisfies Prisma.OrganizationSelect;

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService<{ appConfig: AppConfig }>,
    private readonly notificationsService: NotificationsService,
  ) {}

  async createOrganization(userId: string, dto: CreateOrganizationDto) {
    const normalizedName = dto.name.trim();

    if (normalizedName.length < 2) {
      throw new BadRequestException('РќР°Р·РІР°РЅРёРµ РѕСЂРіР°РЅРёР·Р°С†РёРё РґРѕР»Р¶РЅРѕ СЃРѕРґРµСЂР¶Р°С‚СЊ РјРёРЅРёРјСѓРј 2 СЃРёРјРІРѕР»Р°');
    }

    const slugBase = this.normalizeSlug(dto.slug ?? normalizedName);

    if (!slugBase) {
      throw new BadRequestException('РР· РЅР°Р·РІР°РЅРёСЏ РёР»Рё slug РѕСЂРіР°РЅРёР·Р°С†РёРё РЅРµ СѓРґР°Р»РѕСЃСЊ РїРѕР»СѓС‡РёС‚СЊ РєРѕСЂСЂРµРєС‚РЅС‹Р№ slug');
    }

    const uniqueSlug = await this.ensureUniqueSlug(slugBase);
    const inviteCode = await this.ensureUniqueInviteCode();

    const organization = await this.prisma.$transaction(async (tx) => {
      const createdOrganization = await tx.organization.create({
        data: {
          name: normalizedName,
          slug: uniqueSlug,
          inviteCode,
          description: this.trimOrNull(dto.description),
          timezone: this.trimOrNull(dto.timezone) ?? 'UTC',
          settings: this.toAuditPayload({
            financeEnabled: dto.financeEnabled ?? false,
          }),
          createdByUserId: userId,
        },
        select: organizationSelect,
      });

      await tx.membership.create({
        data: {
          organizationId: createdOrganization.id,
          userId,
          role: OrganizationRole.ADMIN,
          status: MembershipStatus.ACTIVE,
          invitedByUserId: userId,
          acceptedAt: new Date(),
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId: createdOrganization.id,
          actorUserId: userId,
          targetType: AuditTargetType.SETTINGS,
          targetId: createdOrganization.id,
          action: 'organization.created',
          description: 'Organization created',
          payload: {
            name: createdOrganization.name,
            slug: createdOrganization.slug,
          },
        },
      });

      return createdOrganization;
    });

    return {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      inviteCode: organization.inviteCode,
      description: organization.description,
      timezone: organization.timezone,
      createdAt: organization.createdAt,
      updatedAt: organization.updatedAt,
      deletedAt: organization.deletedAt,
      financeEnabled: this.getFinanceEnabled(organization.settings),
      role: OrganizationRole.ADMIN,
      membershipStatus: MembershipStatus.ACTIVE,
    };
  }

  async listMyOrganizations(userId: string) {
    const memberships = await this.prisma.membership.findMany({
      where: {
        userId,
        status: MembershipStatus.ACTIVE,
        organization: {
          deletedAt: null,
        },
      },
      select: {
        role: true,
        status: true,
        acceptedAt: true,
        organization: {
          select: organizationSelect,
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    return memberships.map((membership) => ({
      id: membership.organization.id,
      name: membership.organization.name,
      slug: membership.organization.slug,
      inviteCode: membership.organization.inviteCode,
      description: membership.organization.description,
      timezone: membership.organization.timezone,
      createdAt: membership.organization.createdAt,
      updatedAt: membership.organization.updatedAt,
      deletedAt: membership.organization.deletedAt,
      financeEnabled: this.getFinanceEnabled(membership.organization.settings),
      role: membership.role,
      membershipStatus: membership.status,
      acceptedAt: membership.acceptedAt,
    }));
  }

  async getOrganization(organizationId: string, userId: string) {
    const organization = await this.prisma.organization.findFirst({
      where: {
        id: organizationId,
        deletedAt: null,
        memberships: {
          some: {
            userId,
            status: MembershipStatus.ACTIVE,
          },
        },
      },
      select: {
        ...organizationSelect,
        memberships: {
          where: {
            userId,
            status: MembershipStatus.ACTIVE,
          },
          select: {
            role: true,
            status: true,
          },
          take: 1,
        },
      },
    });

    if (!organization) {
      throw new NotFoundException('Организация не найдена');
    }

    const membership = organization.memberships[0];

    return {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      inviteCode: organization.inviteCode,
      description: organization.description,
      timezone: organization.timezone,
      createdAt: organization.createdAt,
      updatedAt: organization.updatedAt,
      financeEnabled: this.getFinanceEnabled(organization.settings),
      role: membership?.role ?? OrganizationRole.MEMBER,
      membershipStatus: membership?.status ?? MembershipStatus.ACTIVE,
    };
  }

  async updateOrganization(
    organizationId: string,
    userId: string,
    dto: UpdateOrganizationDto,
  ) {
    const organization = await this.findOrganizationOrThrow(organizationId);

    const nextSlug = dto.slug
      ? await this.ensureUniqueSlug(this.normalizeSlug(dto.slug), organization.id)
      : undefined;

    const normalizedName =
      dto.name !== undefined ? this.trimOrNull(dto.name) : undefined;
    const normalizedTimezone =
      dto.timezone !== undefined ? this.trimOrNull(dto.timezone) : undefined;

    if (dto.name !== undefined && (!normalizedName || normalizedName.length < 2)) {
      throw new BadRequestException('Название организации должно содержать минимум 2 символа');
    }

    if (dto.timezone !== undefined && !normalizedTimezone) {
      throw new BadRequestException('Часовой пояс не может быть пустым');
    }

    const currentSettings = this.getOrganizationSettingsRecord(organization.settings);
    const nextSettings =
      dto.financeEnabled !== undefined
        ? {
            ...currentSettings,
            financeEnabled: dto.financeEnabled,
          }
        : undefined;

    const updatedOrganization = await this.prisma.organization.update({
      where: { id: organization.id },
      data: {
        name: normalizedName ?? undefined,
        slug: nextSlug,
        description:
          dto.description !== undefined ? this.trimOrNull(dto.description) : undefined,
        timezone: normalizedTimezone ?? undefined,
        settings: nextSettings ? this.toAuditPayload(nextSettings) : undefined,
      },
      select: organizationSelect,
    });

    await this.prisma.auditLog.create({
      data: {
        organizationId: organization.id,
        actorUserId: userId,
        targetType: AuditTargetType.SETTINGS,
        targetId: organization.id,
        action: 'organization.updated',
        description: 'Organization settings updated',
        payload: this.toAuditPayload(dto),
      },
    });

    return {
      id: updatedOrganization.id,
      name: updatedOrganization.name,
      slug: updatedOrganization.slug,
      inviteCode: updatedOrganization.inviteCode,
      description: updatedOrganization.description,
      timezone: updatedOrganization.timezone,
      createdAt: updatedOrganization.createdAt,
      updatedAt: updatedOrganization.updatedAt,
      deletedAt: updatedOrganization.deletedAt,
      financeEnabled: this.getFinanceEnabled(updatedOrganization.settings),
    };
  }

  async archiveOrganization(organizationId: string, userId: string) {
    const organization = await this.findOrganizationOrThrow(organizationId);
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.organization.update({
        where: { id: organization.id },
        data: {
          deletedAt: now,
        },
      });

      await tx.membership.updateMany({
        where: {
          organizationId: organization.id,
          status: {
            in: [
              MembershipStatus.ACTIVE,
              MembershipStatus.INVITED,
              MembershipStatus.SUSPENDED,
            ],
          },
        },
        data: {
          status: MembershipStatus.LEFT,
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId: organization.id,
          actorUserId: userId,
          targetType: AuditTargetType.SETTINGS,
          targetId: organization.id,
          action: 'organization.archived',
          description: 'Organization archived',
        },
      });
    });

    return {
      success: true as const,
      archivedAt: now.toISOString(),
    };
  }

  async listMemberships(organizationId: string) {
    const organization = await this.findOrganizationOrThrow(organizationId);

    return this.prisma.membership.findMany({
      where: {
        organizationId: organization.id,
      },
      select: {
        id: true,
        role: true,
        status: true,
        invitedAt: true,
        acceptedAt: true,
        createdAt: true,
        updatedAt: true,
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async listMyInvitations(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
        email: true,
        isActive: true,
        deletedAt: true,
      },
    });

    if (!user || !user.isActive || user.deletedAt !== null) {
      return [];
    }

    const invites = await this.prisma.organizationInvite.findMany({
      where: {
        email: user.email,
        status: OrganizationInviteStatus.PENDING,
        revokedAt: null,
        expiresAt: {
          gt: new Date(),
        },
        organization: {
          deletedAt: null,
        },
      },
      select: {
        id: true,
        role: true,
        status: true,
        expiresAt: true,
        createdAt: true,
        organization: {
          select: organizationSelect,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return invites.map((invite) => ({
      invitationId: invite.id,
      membershipId: invite.id,
      role: invite.role,
      status: invite.status,
      invitedAt: invite.createdAt,
      expiresAt: invite.expiresAt,
      organization: {
        id: invite.organization.id,
        name: invite.organization.name,
        slug: invite.organization.slug,
        inviteCode: invite.organization.inviteCode,
        description: invite.organization.description,
        timezone: invite.organization.timezone,
        createdAt: invite.organization.createdAt,
        updatedAt: invite.organization.updatedAt,
        deletedAt: invite.organization.deletedAt,
        financeEnabled: this.getFinanceEnabled(invite.organization.settings),
      },
    }));
  }

  async listMyInvitationHistory(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
        email: true,
        isActive: true,
        deletedAt: true,
      },
    });

    if (!user || !user.isActive || user.deletedAt !== null) {
      return [];
    }

    await this.prisma.organizationInvite.updateMany({
      where: {
        email: user.email,
        status: OrganizationInviteStatus.PENDING,
        expiresAt: {
          lte: new Date(),
        },
      },
      data: {
        status: OrganizationInviteStatus.EXPIRED,
      },
    });

    const invites = await this.prisma.organizationInvite.findMany({
      where: {
        email: user.email,
        OR: [
          {
            status: {
              not: OrganizationInviteStatus.PENDING,
            },
          },
          {
            expiresAt: {
              lte: new Date(),
            },
          },
        ],
        organization: {
          deletedAt: null,
        },
      },
      select: {
        id: true,
        role: true,
        status: true,
        expiresAt: true,
        createdAt: true,
        updatedAt: true,
        acceptedAt: true,
        revokedAt: true,
        acceptedByUserId: true,
        organization: {
          select: organizationSelect,
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    return invites.map((invite) => {
      const status =
        invite.status === OrganizationInviteStatus.REVOKED &&
        invite.acceptedByUserId === user.id
          ? 'DECLINED'
          : invite.status;

      return {
        invitationId: invite.id,
        role: invite.role,
        status,
        invitedAt: invite.createdAt,
        expiresAt: invite.expiresAt,
        resolvedAt: invite.acceptedAt ?? invite.revokedAt ?? invite.updatedAt,
        organization: {
          id: invite.organization.id,
          name: invite.organization.name,
          slug: invite.organization.slug,
          inviteCode: invite.organization.inviteCode,
          description: invite.organization.description,
          timezone: invite.organization.timezone,
          createdAt: invite.organization.createdAt,
          updatedAt: invite.organization.updatedAt,
          deletedAt: invite.organization.deletedAt,
          financeEnabled: this.getFinanceEnabled(invite.organization.settings),
        },
      };
    });
  }

  async acceptMyInvitation(invitationId: string, userId: string) {
    const invite = await this.findInvitationByIdForUserOrThrow(invitationId, userId);
    return this.acceptResolvedInvitation(invite, userId);
  }

  async declineMyInvitation(invitationId: string, userId: string) {
    const invite = await this.findInvitationByIdForUserOrThrow(invitationId, userId);
    const now = new Date();

    await this.prisma.organizationInvite.update({
      where: { id: invite.id },
      data: {
        status: OrganizationInviteStatus.REVOKED,
        acceptedByUserId: userId,
        revokedAt: now,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        organizationId: invite.organizationId,
        actorUserId: userId,
        targetType: AuditTargetType.MEMBERSHIP,
        targetId: invite.id,
        action: 'membership.invitation.declined',
        description: 'Organization invitation declined',
      },
    });

    return {
      success: true as const,
      status: 'DECLINED' as const,
      declinedAt: now.toISOString(),
    };
  }

  async listMyJoinRequests(userId: string) {
    void userId;
    throw new ForbiddenException(
      'Р’СЃС‚СѓРїР»РµРЅРёРµ РІ РѕСЂРіР°РЅРёР·Р°С†РёСЋ РґРѕСЃС‚СѓРїРЅРѕ С‚РѕР»СЊРєРѕ РїРѕ РїСЂРёРіР»Р°С€РµРЅРёСЋ Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂР°',
    );
  }

  async listOrganizationJoinRequests(organizationId: string) {
    void organizationId;
    throw new ForbiddenException(
      'РЎРІРѕР±РѕРґРЅС‹Рµ Р·Р°СЏРІРєРё РЅР° РІСЃС‚СѓРїР»РµРЅРёРµ РѕС‚РєР»СЋС‡РµРЅС‹. РСЃРїРѕР»СЊР·СѓР№С‚Рµ РїСЂРёРіР»Р°С€РµРЅРёСЏ Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂР°.',
    );
  }

  async listOrganizationInvitations(organizationId: string) {
    await this.findOrganizationOrThrow(organizationId);
    const now = new Date();

    await this.prisma.organizationInvite.updateMany({
      where: {
        organizationId,
        status: OrganizationInviteStatus.PENDING,
        expiresAt: {
          lte: now,
        },
      },
      data: {
        status: OrganizationInviteStatus.EXPIRED,
      },
    });

    const invitations = await this.prisma.organizationInvite.findMany({
      where: {
        organizationId,
      },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        expiresAt: true,
        acceptedAt: true,
        revokedAt: true,
        createdAt: true,
        invitedBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        acceptedBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }],
    });

    return invitations.map((invitation) => ({
      invitationId: invitation.id,
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      invitedAt: invitation.createdAt,
      expiresAt: invitation.expiresAt,
      acceptedAt: invitation.acceptedAt,
      revokedAt: invitation.revokedAt,
      invitedBy: invitation.invitedBy,
      acceptedBy: invitation.acceptedBy,
    }));
  }

  async inviteMembership(
    organizationId: string,
    actorUserId: string,
    dto: InviteMembershipDto,
  ) {
    await this.findOrganizationOrThrow(organizationId);
    const actorMembership = await this.prisma.membership.findUnique({
      where: {
        organizationId_userId: {
          organizationId,
          userId: actorUserId,
        },
      },
      select: {
        role: true,
        status: true,
      },
    });

    const email = dto.email.trim().toLowerCase();

    if (!email) {
      throw new BadRequestException('Email обязателен');
    }

    if (!actorMembership || actorMembership.status !== MembershipStatus.ACTIVE) {
      throw new ForbiddenException('Требуется активное членство');
    }

    const role = this.resolveInvitedRole(
      actorMembership.role,
      dto.role ?? OrganizationRole.MEMBER,
    );

    const existingUser = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        isActive: true,
        deletedAt: true,
      },
    });

    const existingMembership = existingUser
      ? await this.prisma.membership.findUnique({
          where: {
            organizationId_userId: {
              organizationId,
              userId: existingUser.id,
            },
          },
          select: {
            id: true,
            status: true,
          },
        })
      : null;

    if (existingMembership && existingMembership.status === MembershipStatus.ACTIVE) {
      throw new ConflictException(
        'Пользователь уже является активным участником этой организации',
      );
    }

    const now = new Date();
    const rawInviteToken = this.generateInviteToken();
    const tokenHash = this.hashToken(rawInviteToken);
    const expiresAt = this.buildInviteExpiryDate(now);

    const pendingInvite = await this.prisma.organizationInvite.findFirst({
      where: {
        organizationId,
        email,
        status: OrganizationInviteStatus.PENDING,
      },
      select: {
        id: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const invite = pendingInvite
      ? await this.prisma.organizationInvite.update({
          where: {
            id: pendingInvite.id,
          },
          data: {
            role,
            tokenHash,
            invitedByUserId: actorUserId,
            acceptedByUserId: null,
            expiresAt,
            acceptedAt: null,
            revokedAt: null,
            status: OrganizationInviteStatus.PENDING,
          },
          select: {
            id: true,
            role: true,
            status: true,
            createdAt: true,
            expiresAt: true,
          },
        })
      : await this.prisma.organizationInvite.create({
          data: {
            organizationId,
            email,
            role,
            tokenHash,
            invitedByUserId: actorUserId,
            expiresAt,
            status: OrganizationInviteStatus.PENDING,
          },
          select: {
            id: true,
            role: true,
            status: true,
            createdAt: true,
            expiresAt: true,
          },
        });

    await this.prisma.auditLog.create({
      data: {
        organizationId,
        actorUserId,
        targetType: AuditTargetType.MEMBERSHIP,
        targetId: invite.id,
        action: 'membership.invited',
        description: 'Organization invitation created',
        payload: this.toAuditPayload({
          email,
          role,
          expiresAt: invite.expiresAt.toISOString(),
        }),
      },
    });

    return {
      invitationId: invite.id,
      email,
      role: invite.role,
      status: invite.status,
      invitedAt: invite.createdAt,
      expiresAt: invite.expiresAt,
      inviteLink: this.buildInvitationLink(rawInviteToken),
      inviteToken: rawInviteToken,
    };
  }

  async revokeInvitation(
    organizationId: string,
    invitationId: string,
    actorUserId: string,
  ) {
    const invitation = await this.prisma.organizationInvite.findFirst({
      where: {
        id: invitationId,
        organizationId,
      },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        revokedAt: true,
        expiresAt: true,
      },
    });

    if (!invitation) {
      throw new NotFoundException('Приглашение не найдено');
    }

    if (invitation.status === OrganizationInviteStatus.ACCEPTED) {
      throw new ConflictException('Принятое приглашение нельзя отозвать');
    }

    const now = new Date();

    if (
      invitation.status === OrganizationInviteStatus.EXPIRED ||
      invitation.expiresAt <= now
    ) {
      if (invitation.status !== OrganizationInviteStatus.EXPIRED) {
        await this.prisma.organizationInvite.update({
          where: {
            id: invitation.id,
          },
          data: {
            status: OrganizationInviteStatus.EXPIRED,
          },
        });
      }

      return {
        success: true as const,
        status: OrganizationInviteStatus.EXPIRED,
      };
    }

    if (
      invitation.status === OrganizationInviteStatus.REVOKED ||
      invitation.revokedAt !== null
    ) {
      return {
        success: true as const,
        status: OrganizationInviteStatus.REVOKED,
      };
    }

    await this.prisma.organizationInvite.update({
      where: {
        id: invitation.id,
      },
      data: {
        status: OrganizationInviteStatus.REVOKED,
        revokedAt: now,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        organizationId,
        actorUserId,
        targetType: AuditTargetType.MEMBERSHIP,
        targetId: invitation.id,
        action: 'membership.invite_revoked',
        description: 'Organization invitation revoked',
        payload: this.toAuditPayload({
          email: invitation.email,
          role: invitation.role,
        }),
      },
    });

    return {
      success: true as const,
      status: OrganizationInviteStatus.REVOKED,
    };
  }

  async acceptInvitation(
    organizationId: string,
    membershipId: string,
    userId: string,
    inviteToken: string,
  ) {
    const user = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
        email: true,
        isEmailVerified: true,
        isActive: true,
        deletedAt: true,
      },
    });

    if (!user || !user.isActive || user.deletedAt !== null) {
      throw new ForbiddenException('Учетная запись пользователя недоступна');
    }

    const invite = await this.prisma.organizationInvite.findFirst({
      where: {
        id: membershipId,
        organizationId,
        email: user.email,
        status: OrganizationInviteStatus.PENDING,
        revokedAt: null,
        expiresAt: {
          gt: new Date(),
        },
        organization: {
          deletedAt: null,
        },
      },
      select: {
        id: true,
        organizationId: true,
        role: true,
        email: true,
        invitedByUserId: true,
        tokenHash: true,
      },
    });

    if (!invite) {
      throw new NotFoundException('Приглашение не найдено');
    }

    if (this.hashToken(inviteToken) !== invite.tokenHash) {
      throw new ForbiddenException('Токен приглашения недействителен');
    }

    const now = new Date();
    const normalizedEmail = user.email.trim().toLowerCase();

    return this.prisma.$transaction(async (tx) => {
      const existingMembership = await tx.membership.findUnique({
        where: {
          organizationId_userId: {
            organizationId,
            userId,
          },
        },
        select: {
          id: true,
          status: true,
        },
      });

      const membership = existingMembership
        ? await tx.membership.update({
            where: {
              id: existingMembership.id,
            },
            data: {
              role: invite.role,
              status: MembershipStatus.ACTIVE,
              invitedByUserId: invite.invitedByUserId,
              invitedAt: now,
              acceptedAt: now,
            },
            select: {
              id: true,
              role: true,
              status: true,
              acceptedAt: true,
            },
          })
        : await tx.membership.create({
            data: {
              organizationId,
              userId,
              role: invite.role,
              status: MembershipStatus.ACTIVE,
              invitedByUserId: invite.invitedByUserId,
              invitedAt: now,
              acceptedAt: now,
            },
            select: {
              id: true,
              role: true,
              status: true,
              acceptedAt: true,
            },
          });

      await tx.organizationInvite.update({
        where: {
          id: invite.id,
        },
        data: {
          status: OrganizationInviteStatus.ACCEPTED,
          acceptedByUserId: userId,
          acceptedAt: now,
        },
      });

      if (!user.isEmailVerified && normalizedEmail === invite.email) {
        await tx.user.update({
          where: {
            id: userId,
          },
          data: {
            isEmailVerified: true,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId: userId,
          targetType: AuditTargetType.MEMBERSHIP,
          targetId: membership.id,
          action: 'membership.accepted',
          description: 'Organization invitation accepted',
        },
      });

      return membership;
    });
  }

  async discoverOrganizations(userId: string, query: DiscoverOrganizationsQueryDto) {
    void userId;
    void query;
    throw new ForbiddenException(
      'РЎРІРѕР±РѕРґРЅС‹Р№ РїРѕРёСЃРє РѕСЂРіР°РЅРёР·Р°С†РёР№ РѕС‚РєР»СЋС‡РµРЅ. Р’СЃС‚СѓРїР»РµРЅРёРµ РІРѕР·РјРѕР¶РЅРѕ С‚РѕР»СЊРєРѕ РїРѕ РїСЂРёРіР»Р°С€РµРЅРёСЋ Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂР°.',
    );
  }

  async createJoinRequest(
    organizationId: string,
    userId: string,
    dto: CreateJoinRequestDto,
  ) {
    void organizationId;
    void userId;
    void dto;
    throw new ForbiddenException(
      'Свободные заявки на вступление отключены. Используйте приглашение администратора.',
    );
  }

  async reviewJoinRequest(
    organizationId: string,
    requestId: string,
    actorUserId: string,
    dto: ReviewJoinRequestDto,
  ) {
    void organizationId;
    void requestId;
    void actorUserId;
    void dto;
    throw new ForbiddenException(
      'Свободные заявки на вступление отключены. Используйте приглашения администратора.',
    );
  }

  async getInvitationByToken(inviteToken: string) {
    const invite = await this.findInvitationByTokenOrThrow(inviteToken);

    return {
      invitationId: invite.id,
      email: invite.email,
      role: invite.role,
      status: invite.status,
      expiresAt: invite.expiresAt,
      organization: this.toOrganizationPreview(invite.organization),
      acceptPath: `/invite/${inviteToken}/accept`,
    };
  }

  async acceptInvitationByToken(inviteToken: string, userId: string) {
    const invite = await this.findInvitationByTokenOrThrow(inviteToken);
    return this.acceptResolvedInvitation(invite, userId);
  }

  async getJoinByInviteCode(inviteCode: string, userId?: string) {
    void inviteCode;
    void userId;
    throw new ForbiddenException(
      'Свободный вход в организацию отключен. Используйте приглашение администратора.',
    );
  }

  async acceptJoinByInviteCode(inviteCode: string, userId: string) {
    void inviteCode;
    void userId;
    throw new ForbiddenException(
      'Свободный вход в организацию отключен. Используйте приглашение администратора.',
    );
  }

  async updateMembership(
    organizationId: string,
    membershipId: string,
    actorUserId: string,
    dto: UpdateMembershipDto,
  ) {
    if (dto.role === undefined && dto.status === undefined) {
      throw new BadRequestException('РќСѓР¶РЅРѕ РїРµСЂРµРґР°С‚СЊ С…РѕС‚СЏ Р±С‹ РѕРґРЅРѕ РїРѕР»Рµ');
    }

    const membership = await this.prisma.membership.findFirst({
      where: {
        id: membershipId,
        organizationId,
      },
      select: {
        id: true,
        userId: true,
        role: true,
        status: true,
        acceptedAt: true,
      },
    });

    if (!membership) {
      throw new NotFoundException('Р§Р»РµРЅСЃС‚РІРѕ РЅРµ РЅР°Р№РґРµРЅРѕ');
    }

    if (membership.userId === actorUserId && dto.role && dto.role !== membership.role) {
      throw new ForbiddenException('РќРµР»СЊР·СЏ РјРµРЅСЏС‚СЊ СЃРѕР±СЃС‚РІРµРЅРЅСѓСЋ СЂРѕР»СЊ');
    }

    const actorMembership = await this.prisma.membership.findUnique({
      where: {
        organizationId_userId: {
          organizationId,
          userId: actorUserId,
        },
      },
      select: {
        role: true,
      },
    });

    if (
      actorMembership?.role === OrganizationRole.DIRECTOR &&
      dto.role === OrganizationRole.ADMIN
    ) {
      throw new ForbiddenException('Директор не может назначать роль админа');
    }

    const targetRole = dto.role ?? membership.role;
    const targetStatus = dto.status ?? membership.status;

    await this.ensureAdminStillExists(
      organizationId,
      membership.id,
      membership.role,
      membership.status,
      targetRole,
      targetStatus,
    );

    const updatedMembership = await this.prisma.membership.update({
      where: { id: membership.id },
      data: {
        role: dto.role,
        status: dto.status,
        acceptedAt:
          dto.status === MembershipStatus.ACTIVE &&
          membership.status !== MembershipStatus.ACTIVE
            ? new Date()
            : undefined,
      },
      select: {
        id: true,
        role: true,
        status: true,
        invitedAt: true,
        acceptedAt: true,
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        organizationId,
        actorUserId,
        targetType: AuditTargetType.MEMBERSHIP,
        targetId: membership.id,
        action: 'membership.updated',
        description: 'Membership updated',
        payload: this.toAuditPayload(dto),
      },
    });

    return updatedMembership;
  }

  async removeMembership(
    organizationId: string,
    membershipId: string,
    actorUserId: string,
  ) {
    const membership = await this.prisma.membership.findFirst({
      where: {
        id: membershipId,
        organizationId,
      },
      select: {
        id: true,
        role: true,
        status: true,
      },
    });

    if (!membership) {
      throw new NotFoundException('Р§Р»РµРЅСЃС‚РІРѕ РЅРµ РЅР°Р№РґРµРЅРѕ');
    }

    const actorMembership = await this.prisma.membership.findUnique({
      where: {
        organizationId_userId: {
          organizationId,
          userId: actorUserId,
        },
      },
      select: {
        role: true,
      },
    });

    if (
      actorMembership?.role === OrganizationRole.DIRECTOR &&
      membership.role === OrganizationRole.ADMIN
    ) {
      throw new ForbiddenException('Директор не может удалять админа организации');
    }

    if (membership.status === MembershipStatus.LEFT) {
      return {
        success: true as const,
        alreadyRemoved: true as const,
      };
    }

    await this.ensureAdminStillExists(
      organizationId,
      membership.id,
      membership.role,
      membership.status,
      membership.role,
      MembershipStatus.LEFT,
    );

    await this.prisma.membership.update({
      where: { id: membership.id },
      data: {
        status: MembershipStatus.LEFT,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        organizationId,
        actorUserId,
        targetType: AuditTargetType.MEMBERSHIP,
        targetId: membership.id,
        action: 'membership.removed',
        description: 'Membership removed from organization',
      },
    });

    return {
      success: true as const,
    };
  }

  async leaveOrganization(organizationId: string, userId: string) {
    const membership = await this.prisma.membership.findUnique({
      where: {
        organizationId_userId: {
          organizationId,
          userId,
        },
      },
      select: {
        id: true,
        role: true,
        status: true,
      },
    });

    if (!membership || membership.status !== MembershipStatus.ACTIVE) {
      throw new NotFoundException('РђРєС‚РёРІРЅРѕРµ С‡Р»РµРЅСЃС‚РІРѕ РЅРµ РЅР°Р№РґРµРЅРѕ');
    }

    await this.ensureAdminStillExists(
      organizationId,
      membership.id,
      membership.role,
      membership.status,
      membership.role,
      MembershipStatus.LEFT,
    );

    await this.prisma.membership.update({
      where: {
        id: membership.id,
      },
      data: {
        status: MembershipStatus.LEFT,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        organizationId,
        actorUserId: userId,
        targetType: AuditTargetType.MEMBERSHIP,
        targetId: membership.id,
        action: 'membership.left',
        description: 'User left organization',
      },
    });

    return {
      success: true as const,
    };
  }

  private async acceptResolvedInvitation(
    invite: {
      id: string;
      organizationId: string;
      role: OrganizationRole;
      email: string;
      invitedByUserId: string | null;
      expiresAt: Date;
      status: OrganizationInviteStatus;
      organization: {
        id: string;
        name: string;
        slug: string;
        inviteCode: string;
        description: string | null;
        timezone: string;
        settings: Prisma.JsonValue | null;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
      };
    },
    userId: string,
  ) {
    const user = await this.findActiveUserOrThrow(userId);
    const normalizedEmail = user.email.trim().toLowerCase();

    if (normalizedEmail !== invite.email) {
      throw new ForbiddenException('Email РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ РЅРµ СЃРѕРІРїР°РґР°РµС‚ СЃ РїСЂРёРіР»Р°С€РµРЅРёРµРј');
    }

    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const existingMembership = await tx.membership.findUnique({
        where: {
          organizationId_userId: {
            organizationId: invite.organizationId,
            userId,
          },
        },
        select: {
          id: true,
          status: true,
        },
      });

      const membership = existingMembership
        ? await tx.membership.update({
            where: { id: existingMembership.id },
            data: {
              role: invite.role,
              status: MembershipStatus.ACTIVE,
              invitedByUserId: invite.invitedByUserId,
              invitedAt: now,
              acceptedAt: now,
              leftAt: null,
              suspendedAt: null,
            },
            select: {
              id: true,
              role: true,
              status: true,
              acceptedAt: true,
            },
          })
        : await tx.membership.create({
            data: {
              organizationId: invite.organizationId,
              userId,
              role: invite.role,
              status: MembershipStatus.ACTIVE,
              invitedByUserId: invite.invitedByUserId,
              invitedAt: now,
              acceptedAt: now,
            },
            select: {
              id: true,
              role: true,
              status: true,
              acceptedAt: true,
            },
          });

      await tx.organizationInvite.update({
        where: { id: invite.id },
        data: {
          status: OrganizationInviteStatus.ACCEPTED,
          acceptedByUserId: userId,
          acceptedAt: now,
        },
      });

      if (!user.isEmailVerified) {
        await tx.user.update({
          where: { id: userId },
          data: {
            isEmailVerified: true,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          organizationId: invite.organizationId,
          actorUserId: userId,
          targetType: AuditTargetType.MEMBERSHIP,
          targetId: membership.id,
          action: 'membership.accepted',
          description: 'Organization invitation accepted',
        },
      });

      return membership;
    });
  }

  private async findInvitationByTokenOrThrow(inviteToken: string) {
    const normalizedToken = inviteToken.trim();

    if (normalizedToken.length < 32) {
      throw new NotFoundException('РџСЂРёРіР»Р°С€РµРЅРёРµ РЅРµ РЅР°Р№РґРµРЅРѕ');
    }

    const invite = await this.prisma.organizationInvite.findFirst({
      where: {
        tokenHash: this.hashToken(normalizedToken),
      },
      select: {
        id: true,
        organizationId: true,
        email: true,
        role: true,
        status: true,
        invitedByUserId: true,
        expiresAt: true,
        revokedAt: true,
        organization: {
          select: organizationSelect,
        },
      },
    });

    if (!invite || !invite.organization || invite.organization.deletedAt !== null) {
      throw new NotFoundException('РџСЂРёРіР»Р°С€РµРЅРёРµ РЅРµ РЅР°Р№РґРµРЅРѕ');
    }

    if (invite.revokedAt !== null || invite.status === OrganizationInviteStatus.REVOKED) {
      throw new GoneException('РџСЂРёРіР»Р°С€РµРЅРёРµ Р±С‹Р»Рѕ РѕС‚РѕР·РІР°РЅРѕ');
    }

    if (invite.status === OrganizationInviteStatus.ACCEPTED) {
      throw new ConflictException('РџСЂРёРіР»Р°С€РµРЅРёРµ СѓР¶Рµ РїСЂРёРЅСЏС‚Рѕ');
    }

    if (invite.expiresAt <= new Date() || invite.status === OrganizationInviteStatus.EXPIRED) {
      if (invite.status === OrganizationInviteStatus.PENDING) {
        await this.prisma.organizationInvite.update({
          where: { id: invite.id },
          data: {
            status: OrganizationInviteStatus.EXPIRED,
          },
        });
      }

      throw new GoneException('РЎСЂРѕРє РґРµР№СЃС‚РІРёСЏ РїСЂРёРіР»Р°С€РµРЅРёСЏ РёСЃС‚РµРє');
    }

    return invite;
  }

  private async findInvitationByIdForUserOrThrow(invitationId: string, userId: string) {
    const user = await this.findActiveUserOrThrow(userId);
    const invite = await this.prisma.organizationInvite.findFirst({
      where: {
        id: invitationId,
        email: user.email,
      },
      select: {
        id: true,
        organizationId: true,
        email: true,
        role: true,
        status: true,
        invitedByUserId: true,
        expiresAt: true,
        revokedAt: true,
        organization: {
          select: organizationSelect,
        },
      },
    });

    if (!invite || !invite.organization || invite.organization.deletedAt !== null) {
      throw new NotFoundException('РџСЂРёРіР»Р°С€РµРЅРёРµ РЅРµ РЅР°Р№РґРµРЅРѕ');
    }

    if (invite.revokedAt !== null || invite.status === OrganizationInviteStatus.REVOKED) {
      throw new GoneException('РџСЂРёРіР»Р°С€РµРЅРёРµ Р±С‹Р»Рѕ РѕС‚РѕР·РІР°РЅРѕ');
    }

    if (invite.status === OrganizationInviteStatus.ACCEPTED) {
      throw new ConflictException('РџСЂРёРіР»Р°С€РµРЅРёРµ СѓР¶Рµ РїСЂРёРЅСЏС‚Рѕ');
    }

    if (invite.expiresAt <= new Date() || invite.status === OrganizationInviteStatus.EXPIRED) {
      if (invite.status === OrganizationInviteStatus.PENDING) {
        await this.prisma.organizationInvite.update({
          where: { id: invite.id },
          data: {
            status: OrganizationInviteStatus.EXPIRED,
          },
        });
      }

      throw new GoneException('РЎСЂРѕРє РґРµР№СЃС‚РІРёСЏ РїСЂРёРіР»Р°С€РµРЅРёСЏ РёСЃС‚РµРє');
    }

    return invite;
  }

  private async findActiveUserOrThrow(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        isEmailVerified: true,
        isActive: true,
        deletedAt: true,
      },
    });

    if (!user || !user.isActive || user.deletedAt !== null) {
      throw new ForbiddenException('РЈС‡РµС‚РЅР°СЏ Р·Р°РїРёСЃСЊ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ РЅРµРґРѕСЃС‚СѓРїРЅР°');
    }

    return user;
  }

  private toOrganizationPreview(
    organization: Pick<
      Prisma.OrganizationGetPayload<{ select: typeof organizationSelect }>,
      'id' | 'name' | 'slug' | 'inviteCode' | 'description' | 'timezone' | 'createdAt' | 'updatedAt'
    > & { settings: Prisma.JsonValue | null | undefined },
  ) {
    return {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      inviteCode: organization.inviteCode,
      description: organization.description,
      timezone: organization.timezone,
      createdAt: organization.createdAt,
      updatedAt: organization.updatedAt,
      financeEnabled: this.getFinanceEnabled(organization.settings),
    };
  }

  private async findOrganizationOrThrow(organizationId: string) {
    const organization = await this.prisma.organization.findFirst({
      where: {
        id: organizationId,
        deletedAt: null,
      },
      select: organizationSelect,
    });

    if (!organization) {
      throw new NotFoundException('РћСЂРіР°РЅРёР·Р°С†РёСЏ РЅРµ РЅР°Р№РґРµРЅР°');
    }

    return organization;
  }

  private async ensureUniqueSlug(slugBase: string, excludeId?: string): Promise<string> {
    let slug = slugBase;
    let sequence = 2;

    while (true) {
      const existing = await this.prisma.organization.findFirst({
        where: {
          slug,
          ...(excludeId ? { id: { not: excludeId } } : {}),
        },
        select: {
          id: true,
        },
      });

      if (!existing) {
        return slug;
      }

      slug = `${slugBase}-${sequence}`;
      sequence += 1;
    }
  }

  private async ensureUniqueInviteCode(): Promise<string> {
    while (true) {
      const inviteCode = this.generateInviteCode();
      const existing = await this.prisma.organization.findFirst({
        where: {
          inviteCode,
        },
        select: {
          id: true,
        },
      });

      if (!existing) {
        return inviteCode;
      }
    }
  }

  private normalizeSlug(input: string): string {
    return input
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-{2,}/g, '-')
      .slice(0, 80);
  }

  private trimOrNull(value?: string | null): string | null {
    if (!value) {
      return null;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private getFinanceEnabled(settings: Prisma.JsonValue | null | undefined): boolean {
    const record = this.getOrganizationSettingsRecord(settings);
    return record.financeEnabled === true;
  }

  private getOrganizationSettingsRecord(
    settings: Prisma.JsonValue | null | undefined,
  ): Record<string, unknown> {
    if (settings && typeof settings === 'object' && !Array.isArray(settings)) {
      return settings as Record<string, unknown>;
    }

    return {};
  }

  private toAuditPayload(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private async ensureAdminStillExists(
    organizationId: string,
    membershipId: string,
    currentRole: OrganizationRole,
    currentStatus: MembershipStatus,
    targetRole: OrganizationRole,
    targetStatus: MembershipStatus,
  ): Promise<void> {
    const isCurrentlyActiveAdmin =
      currentRole === OrganizationRole.ADMIN && currentStatus === MembershipStatus.ACTIVE;
    const staysActiveAdmin =
      targetRole === OrganizationRole.ADMIN && targetStatus === MembershipStatus.ACTIVE;

    if (!isCurrentlyActiveAdmin || staysActiveAdmin) {
      return;
    }

    const otherActiveAdminsCount = await this.prisma.membership.count({
      where: {
        organizationId,
        status: MembershipStatus.ACTIVE,
        role: OrganizationRole.ADMIN,
        id: {
          not: membershipId,
        },
      },
    });

    if (otherActiveAdminsCount === 0) {
      throw new ConflictException('Р’ РѕСЂРіР°РЅРёР·Р°С†РёРё РґРѕР»Р¶РµРЅ РѕСЃС‚Р°РІР°С‚СЊСЃСЏ С…РѕС‚СЏ Р±С‹ РѕРґРёРЅ Р°РєС‚РёРІРЅС‹Р№ ADMIN');
    }
  }

  private resolveInvitedRole(
    actorRole: OrganizationRole,
    targetRole: OrganizationRole,
  ): OrganizationRole {
    if (actorRole === OrganizationRole.ADMIN) {
      return targetRole;
    }

    if (actorRole === OrganizationRole.DIRECTOR) {
      if (
        targetRole === OrganizationRole.ADMIN ||
        targetRole === OrganizationRole.DIRECTOR
      ) {
        throw new ForbiddenException('DIRECTOR РЅРµ РјРѕР¶РµС‚ РїСЂРёРіР»Р°С€Р°С‚СЊ ADMIN РёР»Рё DIRECTOR');
      }

      return targetRole;
    }

    throw new ForbiddenException('РЈ РІР°СЃ РЅРµС‚ РїСЂР°РІ РїСЂРёРіР»Р°С€Р°С‚СЊ СѓС‡Р°СЃС‚РЅРёРєРѕРІ РІ СЌС‚Сѓ РѕСЂРіР°РЅРёР·Р°С†РёСЋ');
  }

  private generateInviteToken(): string {
    return randomBytes(32).toString('base64url');
  }

  private generateInviteCode(): string {
    return randomBytes(6).toString('hex');
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private buildInviteExpiryDate(from: Date): Date {
    return new Date(from.getTime() + 48 * 60 * 60 * 1000);
  }

  private buildInvitationLink(inviteToken: string): string {
    return new URL(`/invite/${inviteToken}`, this.getAppBaseUrl()).toString();
  }

  private getAppBaseUrl(): string {
    const config = this.configService.get<AppConfig>('appConfig');

    if (!config) {
      throw new BadRequestException('РљРѕРЅС„РёРіСѓСЂР°С†РёСЏ РїСЂРёР»РѕР¶РµРЅРёСЏ РЅРµРґРѕСЃС‚СѓРїРЅР°');
    }

    return config.app.corsOrigins[0] ?? config.app.corsOrigin;
  }
}

