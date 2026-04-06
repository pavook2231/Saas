import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { MembershipStatus } from '@prisma/client';
import { Server, Socket } from 'socket.io';

import { AccessTokenPayload } from '../../auth/auth.types';
import { PrismaService } from '../../prisma/prisma.service';

type SubscribeEventPayload = {
  organizationId?: unknown;
  eventId?: unknown;
};

@Injectable()
@WebSocketGateway({
  namespace: '/chats',
  cors: {
    origin: true,
    credentials: true,
  },
})
export class ChatsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(ChatsGateway.name);

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
        client.emit('chat:error', { message: 'Unauthorized' });
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

      client.emit('chat:ready', {
        userId: payload.sub,
        organizations: memberships.map((membership) => membership.organizationId),
      });
    } catch (error) {
      this.logger.warn(`Chat WebSocket auth failed: ${(error as Error).message}`);
      client.emit('chat:error', { message: 'Unauthorized' });
      client.disconnect(true);
    }
  }

  handleDisconnect(@ConnectedSocket() client: Socket): void {
    if (client.connected) {
      client.disconnect(true);
    }
  }

  @SubscribeMessage('chat:subscribe:event')
  async subscribeEventRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: SubscribeEventPayload,
  ) {
    const userId = this.getUserIdOrThrow(client);
    const organizationId = this.normalizeUuid(payload.organizationId, 'organizationId');
    const eventId = this.normalizeUuid(payload.eventId, 'eventId');

    await this.ensureActiveMembership(organizationId, userId);
    await this.ensureEventInOrganization(eventId, organizationId);

    client.join(this.eventRoom(eventId));

    return {
      ok: true as const,
      eventId,
    };
  }

  @SubscribeMessage('chat:unsubscribe:event')
  async unsubscribeEventRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: SubscribeEventPayload,
  ) {
    const eventId = this.normalizeUuid(payload.eventId, 'eventId');
    client.leave(this.eventRoom(eventId));

    return {
      ok: true as const,
      eventId,
    };
  }

  emitToOrganizationChat(organizationId: string, event: string, payload: unknown): void {
    this.server.to(this.organizationRoom(organizationId)).emit(event, payload);
  }

  emitToEventChat(eventId: string, event: string, payload: unknown): void {
    this.server.to(this.eventRoom(eventId)).emit(event, payload);
  }

  private async ensureActiveMembership(organizationId: string, userId: string) {
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
        id: true,
      },
    });

    if (!membership) {
      throw new WsException('Active membership is required');
    }
  }

  private async ensureEventInOrganization(eventId: string, organizationId: string) {
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
      throw new WsException('Event not found');
    }
  }

  private normalizeUuid(raw: unknown, field: string): string {
    if (typeof raw !== 'string') {
      throw new WsException(`${field} must be UUID v4`);
    }

    const value = raw.trim();

    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value,
      )
    ) {
      throw new WsException(`${field} must be UUID v4`);
    }

    return value;
  }

  private getUserIdOrThrow(client: Socket): string {
    const userId = client.data.userId;

    if (typeof userId !== 'string' || userId.trim().length === 0) {
      throw new WsException('Unauthorized');
    }

    return userId;
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
    return `chat:user:${userId}`;
  }

  private organizationRoom(organizationId: string): string {
    return `chat:organization:${organizationId}`;
  }

  private eventRoom(eventId: string): string {
    return `chat:event:${eventId}`;
  }
}
