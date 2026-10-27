import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../database/database.service';

export interface RouteEntity {
  id: string;
  route_code: string;
  name: string;
  description: string | null;
  origin_stop_id: string;
  destination_stop_id: string;
  distance_km: number;
  estimated_duration_minutes: number;
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
  // Joined stop details
  origin_stop_name?: string;
  origin_stop_city?: string;
  destination_stop_name?: string;
  destination_stop_city?: string;
  current_version_number?: number;
}

export interface RouteVersionEntity {
  id: string;
  route_id: string;
  version_number: number;
  effective_from: string;
  effective_to: string | null;
  is_current: boolean;
  change_notes: string | null;
  created_at: Date;
}

export interface StopRefEntity {
  id: string;
  stop_code: string;
  name: string;
  city: string;
  status: string;
}

@Injectable()
export class RoutesRepository {
  constructor(private readonly db: DatabaseService) {}

  async createRoute(
    data: {
      routeCode: string;
      name: string;
      description?: string;
      originStopId: string;
      destinationStopId: string;
      distanceKm: number;
      estimatedDurationMinutes: number;
      status?: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
    },
    client?: PoolClient,
  ): Promise<RouteEntity> {
    const query = `
      INSERT INTO routes (
        route_code,
        name,
        description,
        origin_stop_id,
        destination_stop_id,
        distance_km,
        estimated_duration_minutes,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;
    const params = [
      data.routeCode,
      data.name,
      data.description ?? null,
      data.originStopId,
      data.destinationStopId,
      data.distanceKm,
      data.estimatedDurationMinutes,
      data.status ?? 'ACTIVE',
    ];

    const result = client
      ? await client.query<RouteEntity>(query, params)
      : await this.db.query<RouteEntity>(query, params);

    return result.rows[0];
  }

  async createRouteVersion(
    data: {
      routeId: string;
      versionNumber: number;
      effectiveFrom?: string;
      effectiveTo?: string;
      isCurrent?: boolean;
      changeNotes?: string;
    },
    client?: PoolClient,
  ): Promise<RouteVersionEntity> {
    const query = `
      INSERT INTO route_versions (
        route_id,
        version_number,
        effective_from,
        effective_to,
        is_current,
        change_notes
      )
      VALUES ($1, $2, COALESCE($3, CURRENT_DATE), $4, $5, $6)
      RETURNING *
    `;
    const params = [
      data.routeId,
      data.versionNumber,
      data.effectiveFrom ?? null,
      data.effectiveTo ?? null,
      data.isCurrent ?? true,
      data.changeNotes ?? null,
    ];

    const result = client
      ? await client.query<RouteVersionEntity>(query, params)
      : await this.db.query<RouteVersionEntity>(query, params);

    return result.rows[0];
  }

  async findByCode(routeCode: string, client?: PoolClient): Promise<RouteEntity | null> {
    const query = `
      SELECT
        r.*,
        so.name AS origin_stop_name,
        so.city AS origin_stop_city,
        sd.name AS destination_stop_name,
        sd.city AS destination_stop_city,
        rv.version_number AS current_version_number
      FROM routes r
      LEFT JOIN stops so ON so.id = r.origin_stop_id
      LEFT JOIN stops sd ON sd.id = r.destination_stop_id
      LEFT JOIN route_versions rv ON rv.route_id = r.id AND rv.is_current = TRUE
      WHERE r.route_code = $1
    `;
    const result = client
      ? await client.query<RouteEntity>(query, [routeCode])
      : await this.db.query<RouteEntity>(query, [routeCode]);

    return result.rows[0] ?? null;
  }

  async findById(id: string, client?: PoolClient): Promise<RouteEntity | null> {
    const query = `
      SELECT
        r.*,
        so.name AS origin_stop_name,
        so.city AS origin_stop_city,
        sd.name AS destination_stop_name,
        sd.city AS destination_stop_city,
        rv.version_number AS current_version_number
      FROM routes r
      LEFT JOIN stops so ON so.id = r.origin_stop_id
      LEFT JOIN stops sd ON sd.id = r.destination_stop_id
      LEFT JOIN route_versions rv ON rv.route_id = r.id AND rv.is_current = TRUE
      WHERE r.id = $1
    `;
    const result = client
      ? await client.query<RouteEntity>(query, [id])
      : await this.db.query<RouteEntity>(query, [id]);

    return result.rows[0] ?? null;
  }

  async findStopById(stopId: string, client?: PoolClient): Promise<StopRefEntity | null> {
    const query = `
      SELECT id, stop_code, name, city, status
      FROM stops
      WHERE id = $1
    `;
    const result = client
      ? await client.query<StopRefEntity>(query, [stopId])
      : await this.db.query<StopRefEntity>(query, [stopId]);

    return result.rows[0] ?? null;
  }

  async findAll(params: {
    status?: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
    originStopId?: string;
    destinationStopId?: string;
    search?: string;
    limit: number;
    offset: number;
  }): Promise<{ items: RouteEntity[]; total: number }> {
    const conditions: string[] = ['r.deleted_at IS NULL'];
    const values: unknown[] = [];
    let idx = 1;

    if (params.status) {
      conditions.push(`r.status = $${idx++}`);
      values.push(params.status);
    }

    if (params.originStopId) {
      conditions.push(`r.origin_stop_id = $${idx++}`);
      values.push(params.originStopId);
    }

    if (params.destinationStopId) {
      conditions.push(`r.destination_stop_id = $${idx++}`);
      values.push(params.destinationStopId);
    }

    if (params.search) {
      conditions.push(
        `(r.route_code ILIKE $${idx} OR r.name ILIKE $${idx} OR so.name ILIKE $${idx} OR sd.name ILIKE $${idx})`,
      );
      values.push(`%${params.search}%`);
      idx++;
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const countQuery = `
      SELECT COUNT(r.id)::int AS count
      FROM routes r
      LEFT JOIN stops so ON so.id = r.origin_stop_id
      LEFT JOIN stops sd ON sd.id = r.destination_stop_id
      ${whereClause}
    `;
    const countResult = await this.db.query<{ count: number }>(countQuery, values);
    const total = countResult.rows[0]?.count ?? 0;

    const dataQuery = `
      SELECT
        r.*,
        so.name AS origin_stop_name,
        so.city AS origin_stop_city,
        sd.name AS destination_stop_name,
        sd.city AS destination_stop_city,
        rv.version_number AS current_version_number
      FROM routes r
      LEFT JOIN stops so ON so.id = r.origin_stop_id
      LEFT JOIN stops sd ON sd.id = r.destination_stop_id
      LEFT JOIN route_versions rv ON rv.route_id = r.id AND rv.is_current = TRUE
      ${whereClause}
      ORDER BY r.route_code ASC
      LIMIT $${idx++} OFFSET $${idx++}
    `;
    values.push(params.limit, params.offset);

    const dataResult = await this.db.query<RouteEntity>(dataQuery, values);

    return { items: dataResult.rows, total };
  }

  async updateRoute(
    id: string,
    data: {
      name?: string;
      description?: string;
      distanceKm?: number;
      estimatedDurationMinutes?: number;
    },
    client?: PoolClient,
  ): Promise<RouteEntity | null> {
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

    if (data.distanceKm !== undefined) {
      fields.push(`distance_km = $${idx++}`);
      values.push(data.distanceKm);
    }

    if (data.estimatedDurationMinutes !== undefined) {
      fields.push(`estimated_duration_minutes = $${idx++}`);
      values.push(data.estimatedDurationMinutes);
    }

    if (fields.length === 0) {
      return this.findById(id, client);
    }

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const query = `
      UPDATE routes
      SET ${fields.join(', ')}
      WHERE id = $${idx} AND deleted_at IS NULL
      RETURNING *
    `;

    const result = client
      ? await client.query<RouteEntity>(query, values)
      : await this.db.query<RouteEntity>(query, values);

    return result.rows[0] ?? null;
  }

  async updateRouteStatus(
    id: string,
    status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED',
    client?: PoolClient,
  ): Promise<RouteEntity | null> {
    const query = `
      UPDATE routes
      SET status = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING *
    `;
    const result = client
      ? await client.query<RouteEntity>(query, [id, status])
      : await this.db.query<RouteEntity>(query, [id, status]);

    return result.rows[0] ?? null;
  }

  async softDelete(id: string, client?: PoolClient): Promise<RouteEntity | null> {
    const query = `
      UPDATE routes
      SET
        deleted_at = CURRENT_TIMESTAMP,
        status = 'INACTIVE',
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING *
    `;
    const result = client
      ? await client.query<RouteEntity>(query, [id])
      : await this.db.query<RouteEntity>(query, [id]);

    return result.rows[0] ?? null;
  }

  async findVersionsByRouteId(routeId: string): Promise<RouteVersionEntity[]> {
    const query = `
      SELECT *
      FROM route_versions
      WHERE route_id = $1
      ORDER BY version_number DESC
    `;
    const result = await this.db.query<RouteVersionEntity>(query, [routeId]);
    return result.rows;
  }

  async getLatestVersionNumber(routeId: string, client?: PoolClient): Promise<number> {
    const query = `
      SELECT COALESCE(MAX(version_number), 0)::int AS max_ver
      FROM route_versions
      WHERE route_id = $1
    `;
    const result = client
      ? await client.query<{ max_ver: number }>(query, [routeId])
      : await this.db.query<{ max_ver: number }>(query, [routeId]);

    return result.rows[0]?.max_ver ?? 0;
  }

  async deprecatePreviousVersions(routeId: string, client?: PoolClient): Promise<void> {
    const query = `
      UPDATE route_versions
      SET is_current = FALSE
      WHERE route_id = $1 AND is_current = TRUE
    `;
    if (client) {
      await client.query(query, [routeId]);
    } else {
      await this.db.query(query, [routeId]);
    }
  }
}
