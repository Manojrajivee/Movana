import { Injectable, Logger } from '@nestjs/common';
import { Server } from 'socket.io';
import { RedisService } from '../../redis/redis.service';

export interface ChannelDescriptor {
  channel: string;
  roomPattern: string;
  description: string;
  accessLevel: 'PUBLIC' | 'AUTHENTICATED' | 'USER_OWNED' | 'OPERATIONS';
  eventsPublished: string[];
}

@Injectable()
export class RealTimeService {
  private readonly logger = new Logger(RealTimeService.name);
  private server: Server | null = null;
  private readonly connectedClients: Map<string, { userId: string; roles: string[] }> = new Map();
  private totalMessagesSent = 0;
  private readonly startedAt = Date.now();

  constructor(private readonly redisService: RedisService) {}

  setServer(server: Server): void {
    this.server = server;
  }

  onClientConnected(clientId: string, user: { userId: string; roles: string[] }): void {
    this.connectedClients.set(clientId, user);
    this.logger.debug(
      `RealTime client connected: ${clientId} (user: ${user.userId}) [Total: ${this.connectedClients.size}]`,
    );
  }

  onClientDisconnected(clientId: string): void {
    this.connectedClients.delete(clientId);
    this.logger.debug(
      `RealTime client disconnected: ${clientId} [Remaining: ${this.connectedClients.size}]`,
    );
  }

  async publishToRoom(
    room: string,
    event: string,
    data: Record<string, any>,
  ): Promise<{ deliveredLocally: boolean; room: string; event: string }> {
    this.totalMessagesSent++;

    let deliveredLocally = false;
    if (this.server) {
      this.server.to(room).emit(event, data);
      deliveredLocally = true;
    }

    // Publish to Redis for distributed multi-instance gateway fanout
    try {
      await this.redisService.publish(
        'movana:realtime:events',
        JSON.stringify({ room, event, data, timestamp: new Date().toISOString() }),
      );
    } catch {
      // Redis publish best-effort
    }

    return { deliveredLocally, room, event };
  }

  async broadcastToAll(
    event: string,
    data: Record<string, any>,
  ): Promise<{ deliveredLocally: boolean; event: string }> {
    this.totalMessagesSent++;

    let deliveredLocally = false;
    if (this.server) {
      this.server.emit(event, data);
      deliveredLocally = true;
    }

    try {
      await this.redisService.publish(
        'movana:realtime:events',
        JSON.stringify({ room: '*', event, data, timestamp: new Date().toISOString() }),
      );
    } catch {
      // Redis publish best-effort
    }

    return { deliveredLocally, event };
  }

  getStats(): {
    activeConnections: number;
    totalMessagesSent: number;
    uptimeSeconds: number;
  } {
    return {
      activeConnections: this.connectedClients.size,
      totalMessagesSent: this.totalMessagesSent,
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
    };
  }

  getAvailableChannels(): ChannelDescriptor[] {
    return [
      {
        channel: 'vehicle',
        roomPattern: 'vehicle:{vehicleId}',
        description: 'Live GPS location, heading, speed and sensor telemetry for a vehicle',
        accessLevel: 'AUTHENTICATED',
        eventsPublished: ['vehicle:location', 'vehicle:telemetry', 'vehicle:status'],
      },
      {
        channel: 'trip',
        roomPattern: 'trip:{tripId}',
        description: 'Active transit journey updates, stop arrivals, delay alerts, and live ETA',
        accessLevel: 'AUTHENTICATED',
        eventsPublished: ['trip:progress', 'trip:stop_arrived', 'trip:delay', 'trip:status'],
      },
      {
        channel: 'route',
        roomPattern: 'route:{routeId}',
        description: 'Route-level transit service advisories, detours, and active disruptions',
        accessLevel: 'AUTHENTICATED',
        eventsPublished: ['route:disruption', 'route:detour', 'route:delay_summary'],
      },
      {
        channel: 'user',
        roomPattern: 'user:{userId}',
        description:
          'Private passenger inbox notifications, approaching stop reminders, booking updates',
        accessLevel: 'USER_OWNED',
        eventsPublished: ['user:notification', 'user:stop_reminder', 'user:alert'],
      },
      {
        channel: 'operations',
        roomPattern: 'operations',
        description: 'Platform-wide dispatch live board, safety telematics, driver duty alerts',
        accessLevel: 'OPERATIONS',
        eventsPublished: ['operations:dispatch', 'operations:safety_incident', 'operations:fleet'],
      },
    ];
  }
}
