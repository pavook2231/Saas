import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MembershipStatus, OrganizationRole } from '@prisma/client';
import { Request } from 'express';

import { AccessTokenPayload } from '../../auth/auth.types';
import { PrismaService } from '../../prisma/prisma.service';
import { ALL_ORG_ROLES, ORG_ROLE_METADATA_KEY } from '../organizations.constants';

type RequestWithAuth = Request & {
  user?: AccessTokenPayload;
  organizationMembership?: {
    id: string;
    organizationId: string;
    role: OrganizationRole;
  };
};

@Injectable()
export class OrganizationRoleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithAuth>();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException('Требуется авторизация');
    }

    const organizationId = this.resolveOrganizationId(request);

    if (!organizationId) {
      throw new BadRequestException('В параметрах маршрута нужен organizationId');
    }

    if (!this.isUuidV4(organizationId)) {
      throw new BadRequestException('organizationId должен быть UUID v4');
    }

    const requiredRoles =
      this.reflector.getAllAndOverride<OrganizationRole[]>(ORG_ROLE_METADATA_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? ALL_ORG_ROLES;

    const membership = await this.prisma.membership.findFirst({
      where: {
        organizationId,
        userId: user.sub,
        status: MembershipStatus.ACTIVE,
        organization: {
          deletedAt: null,
        },
      },
      select: {
        id: true,
        organizationId: true,
        role: true,
      },
    });

    if (!membership) {
      throw new ForbiddenException('Требуется активное членство в организации');
    }

    if (requiredRoles.length > 0 && !requiredRoles.includes(membership.role)) {
      throw new ForbiddenException('Недостаточно прав в организации');
    }

    request.organizationMembership = membership;
    return true;
  }

  private resolveOrganizationId(request: Request): string | null {
    const paramsCandidate = request.params?.organizationId ?? request.params?.id;

    if (typeof paramsCandidate === 'string' && paramsCandidate.trim().length > 0) {
      return paramsCandidate;
    }

    const bodyCandidate = (request.body as { organizationId?: unknown })?.organizationId;

    if (typeof bodyCandidate === 'string' && bodyCandidate.trim().length > 0) {
      return bodyCandidate;
    }

    const queryCandidate = (request.query as { organizationId?: unknown })?.organizationId;

    if (typeof queryCandidate === 'string' && queryCandidate.trim().length > 0) {
      return queryCandidate;
    }

    return null;
  }

  private isUuidV4(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    );
  }
}
