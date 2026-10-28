import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { RealTimeService } from '../services/real-time.service';

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/realtime',
})
export class RealTimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(RealTimeGateway.name);
  private readonly clientMessageCounts: Map<string, { count: number; resetAt: number }> = new Map();

  constructor(
    private readonly jwtService: JwtService,
    private readonly realTimeService: RealTimeService,
  ) {}

  afterInit(server: Server): void {
    this.realTimeService.setServer(server);
    this.logger.log('RealTime WebSocket Gateway initialized on namespace /realtime');
  }

  async handleConnection(client: Socket): Promise<void> {
    try {
      const rawToken =
        client.handshake.auth?.token ||
        (client.handshake.headers?.authorization
          ? client.handshake.headers.authorization.replace(/^Bearer\s+/i, '')
          : null) ||
        (client.handshake.query?.token as string);

      if (!rawToken) {
        this.logger.warn(`Connection rejected for client ${client.id}: Missing token`);
        client.emit('error', {
          message: 'Authentication required: missing Bearer token in handshake',
        });
        client.disconnect(true);
        return;
      }

      const payload = await this.jwtService.verifyAsync(rawToken);
      const user = {
        userId: payload.sub,
        email: payload.email,
        roles: Array.isArray(payload.roles) ? payload.roles : [],
      };

      client.data.user = user;
      this.realTimeService.onClientConnected(client.id, user);

      client.emit('connected', {
        socketId: client.id,
        userId: user.userId,
        timestamp: new Date().toISOString(),
      });
    } catch {
      this.logger.warn(`Connection rejected for client ${client.id}: Invalid token`);
      client.emit('error', {
        message: 'Authentication failed: invalid or expired JWT token',
      });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    this.clientMessageCounts.delete(client.id);
    this.realTimeService.onClientDisconnected(client.id);
  }

  private checkRateLimit(clientId: string): boolean {
    const now = Date.now();
    let record = this.clientMessageCounts.get(clientId);
    if (!record || now > record.resetAt) {
      record = { count: 0, resetAt: now + 10000 };
      this.clientMessageCounts.set(clientId, record);
    }
    record.count++;
    return record.count <= 50; // max 50 requests per 10 seconds per socket
  }

  @SubscribeMessage('subscribe')
  handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { channel: string; targetId?: string },
  ): { event: string; room?: string; success: boolean; error?: string } {
    if (!this.checkRateLimit(client.id)) {
      return {
        event: 'error',
        success: false,
        error: 'Rate limit exceeded: too many subscription requests',
      };
    }

    const user = client.data?.user;
    if (!user) {
      return { event: 'error', success: false, error: 'Unauthorized connection' };
    }

    const { channel, targetId } = payload || {};
    if (!channel) {
      return { event: 'error', success: false, error: 'Channel name is required' };
    }

    let room: string;

    if (channel === 'user') {
      if (targetId && targetId !== user.userId) {
        return {
          event: 'error',
          success: false,
          error: 'Access denied: cannot subscribe to another user private channel',
        };
      }
      room = `user:${user.userId}`;
    } else if (channel === 'operations') {
      const allowedRoles = ['ADMIN', 'OPERATOR', 'SAFETY_OFFICER', 'FLEET_MANAGER'];
      const hasStaffRole = user.roles.some((r: string) => allowedRoles.includes(r));
      if (!hasStaffRole) {
        return {
          event: 'error',
          success: false,
          error: 'Access denied: operations channel requires staff dispatch authorization',
        };
      }
      room = 'operations';
    } else if (channel === 'vehicle' || channel === 'trip' || channel === 'route') {
      if (!targetId) {
        return {
          event: 'error',
          success: false,
          error: `Channel '${channel}' requires a targetId parameter`,
        };
      }
      room = `${channel}:${targetId}`;
    } else {
      return {
        event: 'error',
        success: false,
        error: `Unsupported real-time channel: '${channel}'`,
      };
    }

    client.join(room);
    this.logger.debug(`Socket ${client.id} subscribed to room '${room}'`);
    return { event: 'subscribed', room, success: true };
  }

  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { room: string },
  ): { event: string; room?: string; success: boolean } {
    const room = payload?.room;
    if (room) {
      client.leave(room);
      this.logger.debug(`Socket ${client.id} unsubscribed from room '${room}'`);
    }
    return { event: 'unsubscribed', room, success: true };
  }

  @SubscribeMessage('ping')
  handlePing(): { event: string; timestamp: number } {
    return { event: 'pong', timestamp: Date.now() };
  }
}
