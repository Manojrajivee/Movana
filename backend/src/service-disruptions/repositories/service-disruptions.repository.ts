import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { RedisService } from '../../redis/redis.service';

export interface ServiceDisruption {
  id: string;
  title: string;
  description: string;
  disruptionType: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  status: 'ACTIVE' | 'RESOLVED';
  routeId?: string | null;
  routeCode?: string | null;
  routeName?: string | null;
  tripId?: string | null;
  tripNumber?: string | null;
  affectedStops: string[];
  startsAt: Date;
  endsAt: Date | null;
  resolvedAt: Date | null;
  resolutionNotes?: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class ServiceDisruptionsRepository {
  private readonly DISRUPTION_TTL_SECONDS = 604800; // 7 days

  constructor(
    private readonly db: DatabaseService,
    private readonly redis: RedisService,
  ) {}

  async findRouteById(routeId: string): Promise<any | null> {
    const query = `SELECT * FROM routes WHERE id = $1 AND deleted_at IS NULL;`;
    const res = await this.db.query(query, [routeId]);
    return res.rows[0] || null;
  }

  async findTripById(tripId: string): Promise<any | null> {
    const query = `
      SELECT t.*, r.route_code, r.name AS route_name
      FROM trips t
      JOIN routes r ON t.route_id = r.id
      WHERE t.id = $1;
    `;
    const res = await this.db.query(query, [tripId]);
    return res.rows[0] || null;
  }

  async findStopById(stopId: string): Promise<any | null> {
    const query = `SELECT * FROM stops WHERE id = $1;`;
    const res = await this.db.query(query, [stopId]);
    return res.rows[0] || null;
  }

  async saveDisruption(disruption: ServiceDisruption): Promise<void> {
    const key = `movana:disruption:${disruption.id}`;
    const payload = JSON.stringify(disruption);

    await this.redis.set(key, payload, this.DISRUPTION_TTL_SECONDS);
    await this.redis.sadd('movana:disruptions:all', disruption.id);

    if (disruption.status === 'ACTIVE') {
      await this.redis.sadd('movana:disruptions:active', disruption.id);
    } else {
      await this.redis.srem('movana:disruptions:active', disruption.id);
    }

    if (disruption.routeId) {
      await this.redis.sadd(`movana:disruptions:route:${disruption.routeId}`, disruption.id);
    }
    if (disruption.tripId) {
      await this.redis.sadd(`movana:disruptions:trip:${disruption.tripId}`, disruption.id);
    }
  }

  async findDisruptionById(id: string): Promise<ServiceDisruption | null> {
    const key = `movana:disruption:${id}`;
    const raw = await this.redis.get(key);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return {
        ...parsed,
        startsAt: new Date(parsed.startsAt),
        endsAt: parsed.endsAt ? new Date(parsed.endsAt) : null,
        resolvedAt: parsed.resolvedAt ? new Date(parsed.resolvedAt) : null,
        createdAt: new Date(parsed.createdAt),
        updatedAt: new Date(parsed.updatedAt),
      };
    } catch {
      return null;
    }
  }

  async findActiveDisruptions(): Promise<ServiceDisruption[]> {
    const ids = await this.redis.smembers('movana:disruptions:active');
    if (!ids || ids.length === 0) return [];

    const disruptions: ServiceDisruption[] = [];
    for (const id of ids) {
      const d = await this.findDisruptionById(id);
      if (d) {
        disruptions.push(d);
      } else {
        await this.redis.srem('movana:disruptions:active', id);
      }
    }
    return disruptions.sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime());
  }

  async findAllDisruptions(): Promise<ServiceDisruption[]> {
    const ids = await this.redis.smembers('movana:disruptions:all');
    if (!ids || ids.length === 0) return [];

    const disruptions: ServiceDisruption[] = [];
    for (const id of ids) {
      const d = await this.findDisruptionById(id);
      if (d) {
        disruptions.push(d);
      } else {
        await this.redis.srem('movana:disruptions:all', id);
      }
    }
    return disruptions.sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime());
  }

  async deleteDisruption(
    id: string,
    routeId?: string | null,
    tripId?: string | null,
  ): Promise<void> {
    await this.redis.del(`movana:disruption:${id}`);
    await this.redis.srem('movana:disruptions:all', id);
    await this.redis.srem('movana:disruptions:active', id);
    if (routeId) {
      await this.redis.srem(`movana:disruptions:route:${routeId}`, id);
    }
    if (tripId) {
      await this.redis.srem(`movana:disruptions:trip:${tripId}`, id);
    }
  }
}
