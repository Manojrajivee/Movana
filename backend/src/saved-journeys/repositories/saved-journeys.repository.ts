import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { RedisService } from '../../redis/redis.service';
import { CreateSavedLocationDto } from '../dto/create-saved-location.dto';

export interface UserAddressEntity {
  id: string;
  user_id: string;
  address_type: string;
  street_address: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  is_default: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface SavedRouteEntity {
  id: string;
  userId: string;
  name: string;
  originStopId: string;
  originStopName: string;
  destinationStopId: string;
  destinationStopName: string;
  preferredDepartureTime?: string;
  daysOfWeek: string[];
  notifyDelayAlerts: boolean;
  createdAt: Date;
}

@Injectable()
export class SavedJourneysRepository {
  private readonly SAVED_ROUTE_TTL_SECONDS = 31536000; // 1 year

  constructor(
    private readonly db: DatabaseService,
    private readonly redis: RedisService,
  ) {}

  async saveUserAddress(userId: string, dto: CreateSavedLocationDto): Promise<UserAddressEntity> {
    const query = `
      INSERT INTO user_addresses (
        user_id, address_type, street_address, city, state, postal_code,
        country, latitude, longitude, is_default
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *;
    `;
    const res = await this.db.query<UserAddressEntity>(query, [
      userId,
      dto.addressType,
      dto.streetAddress,
      dto.city,
      dto.state,
      dto.postalCode,
      dto.country || 'India',
      dto.latitude ?? null,
      dto.longitude ?? null,
      dto.isDefault ?? false,
    ]);
    return res.rows[0];
  }

  async findUserAddresses(userId: string): Promise<UserAddressEntity[]> {
    const query = `
      SELECT *
      FROM user_addresses
      WHERE user_id = $1
      ORDER BY is_default DESC, created_at DESC;
    `;
    const res = await this.db.query<UserAddressEntity>(query, [userId]);
    return res.rows;
  }

  async findUserAddressById(id: string): Promise<UserAddressEntity | null> {
    const query = `SELECT * FROM user_addresses WHERE id = $1;`;
    const res = await this.db.query<UserAddressEntity>(query, [id]);
    return res.rows[0] || null;
  }

  async deleteUserAddress(id: string, userId: string): Promise<boolean> {
    const query = `DELETE FROM user_addresses WHERE id = $1 AND user_id = $2 RETURNING id;`;
    const res = await this.db.query(query, [id, userId]);
    return (res.rowCount || 0) > 0;
  }

  async findStopById(id: string): Promise<any | null> {
    const query = `SELECT id, stop_code, name, city, latitude::float, longitude::float FROM stops WHERE id = $1 AND status = 'ACTIVE';`;
    const res = await this.db.query(query, [id]);
    return res.rows[0] || null;
  }

  async saveSavedRoute(route: SavedRouteEntity): Promise<void> {
    const key = `movana:saved_route:${route.id}`;
    const payload = JSON.stringify(route);

    await this.redis.set(key, payload, this.SAVED_ROUTE_TTL_SECONDS);
    await this.redis.sadd(`movana:saved_routes:user:${route.userId}`, route.id);
  }

  async findSavedRouteById(id: string): Promise<SavedRouteEntity | null> {
    const key = `movana:saved_route:${id}`;
    const raw = await this.redis.get(key);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return {
        ...parsed,
        createdAt: new Date(parsed.createdAt),
      };
    } catch {
      return null;
    }
  }

  async findSavedRoutesByUserId(userId: string): Promise<SavedRouteEntity[]> {
    const ids = await this.redis.smembers(`movana:saved_routes:user:${userId}`);
    if (!ids || ids.length === 0) return [];

    const routes: SavedRouteEntity[] = [];
    for (const id of ids) {
      const route = await this.findSavedRouteById(id);
      if (route) {
        routes.push(route);
      } else {
        await this.redis.srem(`movana:saved_routes:user:${userId}`, id);
      }
    }
    return routes.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async deleteSavedRoute(id: string, userId: string): Promise<void> {
    await this.redis.del(`movana:saved_route:${id}`);
    await this.redis.srem(`movana:saved_routes:user:${userId}`, id);
  }

  async findNextTripBetweenStops(originStopId: string, destStopId: string): Promise<any | null> {
    const query = `
      SELECT 
        t.id AS trip_id,
        t.trip_number,
        r.route_code,
        r.name AS route_name,
        t.status AS trip_status,
        ts1.scheduled_departure_at AS departure_time,
        ts2.scheduled_arrival_at AS arrival_time,
        t.delay_minutes,
        v.vehicle_code,
        v.registration_number
      FROM trip_stops ts1
      JOIN trip_stops ts2 ON ts1.trip_id = ts2.trip_id
      JOIN trips t ON ts1.trip_id = t.id
      JOIN routes r ON t.route_id = r.id
      LEFT JOIN vehicles v ON t.vehicle_id = v.id
      WHERE ts1.stop_id = $1
        AND ts2.stop_id = $2
        AND ts1.sequence_number < ts2.sequence_number
        AND t.status IN ('SCHEDULED', 'BOARDING', 'IN_TRANSIT')
        AND ts1.scheduled_departure_at >= CURRENT_TIMESTAMP - INTERVAL '30 minutes'
      ORDER BY ts1.scheduled_departure_at ASC
      LIMIT 1;
    `;
    const res = await this.db.query(query, [originStopId, destStopId]);
    return res.rows[0] || null;
  }
}
