import {
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { MembershipStatus } from '@prisma/client';
import { Server, Socket } from 'socket.io';

import { AccessTokenPayload } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
@WebSocketGateway({
  namespace: '/notifications',
  cors: {
    origin: true,
    credentials: true,
  },
})
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(NotificationsGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(@ConnectedSocket() client: Socket): Promise<void> {
    try {
      this.ensureAllowedTransport(client);
      this.ensureAllowedOrigin(client);
      const token = this.extractToken(client);

      if (!token) {
        client.emit('notifications:error', { message: 'Unauthorized' });
        client.disconnect(true);
        return;
      }

      const appName =
        this.configService.get<string>('appConfig.app.name') ?? 'saas-platform-api';
      const payload = this.jwtService.verify<AccessTokenPayload>(token, {
        secret: this.configService.get<string>('appConfig.jwt.accessSecret'),
        issuer: appName,
        audience: 'auth-access',
      });

      if (
        payload.type !== 'access' ||
        typeof payload.sub !== 'string' ||
        payload.sub.trim().length === 0
      ) {
        throw new Error('Invalid access token payload');
      }

      const user = await this.prisma.user.findUnique({
        where: {
          id: payload.sub,
        },
        select: {
          id: true,
          isActive: true,
          deletedAt: true,
        },
      });

      if (!user || !user.isActive || user.deletedAt !== null) {
        throw new Error('User is disabled');
      }

      client.data.userId = payload.sub;
      client.join(this.userRoom(payload.sub));

      const memberships = await this.prisma.membership.findMany({
        where: {
          userId: payload.sub,
          status: MembershipStatus.ACTIVE,
          organization: {
            deletedAt: null,
          },
        },
        select: {
          organizationId: true,
        },
      });

      memberships.forEach((membership) => {
        client.join(this.organizationRoom(membership.organizationId));
      });

      client.emit('notifications:ready', {
        userId: payload.sub,
        organizations: memberships.map((membership) => membership.organizationId),
      });
    } catch (error) {
      this.logger.warn(`WebSocket auth failed: ${(error as Error).message}`);
      client.emit('notifications:error', { message: 'Unauthorized' });
      client.disconnect(true);
    }
  }

  handleDisconnect(@ConnectedSocket() client: Socket): void {
    if (client.connected) {
      client.disconnect(true);
    }
  }

  emitToUsers(userIds: string[], event: string, payload: unknown): void {
    const uniqueIds = Array.from(new Set(userIds));

    uniqueIds.forEach((userId) => {
      this.server.to(this.userRoom(userId)).emit(event, payload);
    });
  }

  emitToOrganization(organizationId: string, event: string, payload: unknown): void {
    this.server.to(this.organizationRoom(organizationId)).emit(event, payload);
  }

  private extractToken(client: Socket): string | null {
    const authTokenCandidate = client.handshake.auth?.token;

    if (typeof authTokenCandidate === 'string' && authTokenCandidate.trim().length > 0) {
      return authTokenCandidate.trim();
    }

    const header = client.handshake.headers.authorization;

    if (typeof header !== 'string') {
      return null;
    }

    if (!header.toLowerCase().startsWith('bearer ')) {
      return null;
    }

    const token = header.slice(7).trim();
    return token.length > 0 ? token : null;
  }

  private ensureAllowedOrigin(client: Socket): void {
    const allowedOrigins =
      this.configService.get<string[]>('appConfig.app.corsOrigins') ?? [];
    const originHeader = client.handshake.headers.origin;
    const origin = Array.isArray(originHeader) ? originHeader[0] : originHeader;

    if (!origin) {
      return;
    }

    if (!allowedOrigins.includes(origin)) {
      throw new Error('Origin is not allowed');
    }
  }

  private ensureAllowedTransport(client: Socket): void {
    const requireHttps =
      this.configService.get<boolean>('appConfig.security.requireHttps') ?? false;

    if (!requireHttps) {
      return;
    }

    const forwardedProtoHeader = client.handshake.headers['x-forwarded-proto'];
    const forwardedProto = Array.isArray(forwardedProtoHeader)
      ? forwardedProtoHeader[0]
      : forwardedProtoHeader;
    const isSecure =
      client.handshake.secure ||
      (typeof forwardedProto === 'string' && forwardedProto.toLowerCase() === 'https');

    if (!isSecure) {
      throw new Error('Secure WebSocket transport is required');
    }
  }

  private userRoom(userId: string): string {
    return `user:${userId}`;
  }

  private organizationRoom(organizationId: string): string {
    return `organization:${organizationId}`;
  }
}
