import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../database/database.service';

export interface StopEntity {
  id: string;
  stop_code: string;
  name: string;
  description: string | null;
  address: string;
  city: string;
  state: string;
  country: string;
  postal_code: string | null;
  latitude: number;
  longitude: number;
  geofence_radius_meters: number;
  status: 'ACTIVE' | 'INACTIVE' | 'TEMPORARILY_CLOSED';
  created_at: Date;
  updated_at: Date;
  distance_km?: number;
}

@Injectable()
export class StopsRepository {
  constructor(private readonly db: DatabaseService) {}

  async createStop(
    data: {
      stopCode: string;
      name: string;
      description?: string;
      address: string;
      city: string;
      state: string;
      country?: string;
      postalCode?: string;
      latitude: number;
      longitude: number;
      geofenceRadiusMeters?: number;
      status?: 'ACTIVE' | 'INACTIVE' | 'TEMPORARILY_CLOSED';
    },
    client?: PoolClient,
  ): Promise<StopEntity> {
    const query = `
      INSERT INTO stops (
        stop_code,
        name,
        description,
        address,
        city,
        state,
        country,
        postal_code,
        latitude,
        longitude,
        geofence_radius_meters,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `;
    const params = [
      data.stopCode,
      data.name,
      data.description ?? null,
      data.address,
      data.city,
      data.state,
      data.country ?? 'India',
      data.postalCode ?? null,
      data.latitude,
      data.longitude,
      data.geofenceRadiusMeters ?? 100,
      data.status ?? 'ACTIVE',
    ];

    const result = client
      ? await client.query<StopEntity>(query, params)
      : await this.db.query<StopEntity>(query, params);

    return result.rows[0];
  }

  async findByCode(stopCode: string, client?: PoolClient): Promise<StopEntity | null> {
    const query = `SELECT * FROM stops WHERE stop_code = $1`;
    const result = client
      ? await client.query<StopEntity>(query, [stopCode])
      : await this.db.query<StopEntity>(query, [stopCode]);

    return result.rows[0] ?? null;
  }

  async findById(id: string, client?: PoolClient): Promise<StopEntity | null> {
    const query = `SELECT * FROM stops WHERE id = $1`;
    const result = client
      ? await client.query<StopEntity>(query, [id])
      : await this.db.query<StopEntity>(query, [id]);

    return result.rows[0] ?? null;
  }

  async findAll(params: {
    city?: string;
    state?: string;
    status?: 'ACTIVE' | 'INACTIVE' | 'TEMPORARILY_CLOSED';
    search?: string;
    limit: number;
    offset: number;
  }): Promise<{ items: StopEntity[]; total: number }> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (params.city) {
      conditions.push(`city ILIKE $${idx++}`);
      values.push(params.city);
    }

    if (params.state) {
      conditions.push(`state ILIKE $${idx++}`);
      values.push(params.state);
    }

    if (params.status) {
      conditions.push(`status = $${idx++}`);
      values.push(params.status);
    }

    if (params.search) {
      conditions.push(
        `(stop_code ILIKE $${idx} OR name ILIKE $${idx} OR address ILIKE $${idx} OR city ILIKE $${idx})`,
      );
      values.push(`%${params.search}%`);
      idx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countQuery = `SELECT COUNT(id)::int AS count FROM stops ${whereClause}`;
    const countResult = await this.db.query<{ count: number }>(countQuery, values);
    const total = countResult.rows[0]?.count ?? 0;

    const dataQuery = `
      SELECT *
      FROM stops
      ${whereClause}
      ORDER BY name ASC
      LIMIT $${idx++} OFFSET $${idx++}
    `;
    values.push(params.limit, params.offset);

    const dataResult = await this.db.query<StopEntity>(dataQuery, values);

    return { items: dataResult.rows, total };
  }

  async findNearby(
    latitude: number,
    longitude: number,
    radiusKm: number,
    limit: number,
  ): Promise<StopEntity[]> {
    const query = `
      SELECT * FROM (
        SELECT *,
          ROUND(
            (6371 * acos(
              LEAST(1.0, GREATEST(-1.0,
                cos(radians($1)) * cos(radians(latitude)) *
                cos(radians(longitude) - radians($2)) +
                sin(radians($1)) * sin(radians(latitude))
              ))
            ))::numeric, 2
          )::float AS distance_km
        FROM stops
        WHERE status = 'ACTIVE'
      ) sub
      WHERE distance_km <= $3
      ORDER BY distance_km ASC
      LIMIT $4
    `;
    const result = await this.db.query<StopEntity>(query, [latitude, longitude, radiusKm, limit]);
    return result.rows;
  }

  async updateStop(
    id: string,
    data: {
      name?: string;
      description?: string;
      address?: string;
      city?: string;
      state?: string;
      country?: string;
      postalCode?: string;
      latitude?: number;
      longitude?: number;
      geofenceRadiusMeters?: number;
    },
    client?: PoolClient,
  ): Promise<StopEntity | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (data.name !== undefined) {
      fields.push(`name = $${idx++}`);
      values.push(data.name);
    }

    if (data.description !== undefined) {
      fields.push(`description = $${idx++}`);
      values.push(data.description);
    }

    if (data.address !== undefined) {
      fields.push(`address = $${idx++}`);
      values.push(data.address);
    }

    if (data.city !== undefined) {
      fields.push(`city = $${idx++}`);
      values.push(data.city);
    }

    if (data.state !== undefined) {
      fields.push(`state = $${idx++}`);
      values.push(data.state);
    }

    if (data.country !== undefined) {
      fields.push(`country = $${idx++}`);
      values.push(data.country);
    }

    if (data.postalCode !== undefined) {
      fields.push(`postal_code = $${idx++}`);
      values.push(data.postalCode);
    }

    if (data.latitude !== undefined) {
      fields.push(`latitude = $${idx++}`);
      values.push(data.latitude);
    }

    if (data.longitude !== undefined) {
      fields.push(`longitude = $${idx++}`);
      values.push(data.longitude);
    }

    if (data.geofenceRadiusMeters !== undefined) {
      fields.push(`geofence_radius_meters = $${idx++}`);
      values.push(data.geofenceRadiusMeters);
    }

    if (fields.length === 0) {
      return this.findById(id, client);
    }

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const query = `
      UPDATE stops
      SET ${fields.join(', ')}
      WHERE id = $${idx}
      RETURNING *
    `;

    const result = client
      ? await client.query<StopEntity>(query, values)
      : await this.db.query<StopEntity>(query, values);

    return result.rows[0] ?? null;
  }

  async updateStatus(
    id: string,
    status: 'ACTIVE' | 'INACTIVE' | 'TEMPORARILY_CLOSED',
    client?: PoolClient,
  ): Promise<StopEntity | null> {
    const query = `
      UPDATE stops
      SET status = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;
    const result = client
      ? await client.query<StopEntity>(query, [id, status])
      : await this.db.query<StopEntity>(query, [id, status]);

    return result.rows[0] ?? null;
  }

  async deleteStop(id: string, client?: PoolClient): Promise<StopEntity | null> {
    const query = `
      DELETE FROM stops
      WHERE id = $1
      RETURNING *
    `;
    const result = client
      ? await client.query<StopEntity>(query, [id])
      : await this.db.query<StopEntity>(query, [id]);

    return result.rows[0] ?? null;
  }

  async countActiveRoutesUsingStop(stopId: string): Promise<number> {
    const query = `
      SELECT COUNT(id)::int AS count
      FROM routes
      WHERE (origin_stop_id = $1 OR destination_stop_id = $1)
        AND status = 'ACTIVE'
        AND deleted_at IS NULL
    `;
    const result = await this.db.query<{ count: number }>(query, [stopId]);
    return result.rows[0]?.count ?? 0;
  }

  async countRouteStopsUsingStop(stopId: string): Promise<number> {
    const query = `
      SELECT COUNT(id)::int AS count
      FROM route_stops
      WHERE stop_id = $1
    `;
    const result = await this.db.query<{ count: number }>(query, [stopId]);
    return result.rows[0]?.count ?? 0;
  }
}
