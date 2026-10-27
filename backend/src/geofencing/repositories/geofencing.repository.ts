import { Injectable, Logger } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../database/database.service';
import { CreateGeofenceDto } from '../dto/create-geofence.dto';
import { QueryGeofenceEventsDto } from '../dto/query-geofence-events.dto';
import { QueryGeofencesDto } from '../dto/query-geofences.dto';
import { UpdateGeofenceDto } from '../dto/update-geofence.dto';

export interface GeofenceEntity {
  id: string;
  name: string;
  description: string | null;
  latitude: number;
  longitude: number;
  radius_meters: number;
  type: string;
  status: string;
  created_at: Date;
  updated_at: Date;
}

export interface GeofenceEventEntity {
  id: string;
  geofence_id: string;
  vehicle_id: string;
  trip_id: string | null;
  event_type: 'ENTER' | 'EXIT';
  latitude: number;
  longitude: number;
  occurred_at: Date;
  created_at: Date;
  geofence_name?: string;
  vehicle_code?: string;
}

@Injectable()
export class GeofencingRepository {
  private readonly logger = new Logger(GeofencingRepository.name);

  constructor(private readonly db: DatabaseService) {}

  async createGeofence(dto: CreateGeofenceDto): Promise<GeofenceEntity> {
    const sql = `
      INSERT INTO geofences (
        name,
        description,
        latitude,
        longitude,
        radius_meters,
        type,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING 
        id,
        name,
        description,
        latitude::float,
        longitude::float,
        radius_meters,
        type,
        status,
        created_at,
        updated_at;
    `;
    const values = [
      dto.name,
      dto.description ?? null,
      dto.latitude,
      dto.longitude,
      dto.radiusMeters,
      dto.type ?? 'TERMINAL',
      dto.status ?? 'ACTIVE',
    ];
    const res = await this.db.query<GeofenceEntity>(sql, values);
    return res.rows[0];
  }

  async findByName(name: string): Promise<GeofenceEntity | null> {
    const sql = `
      SELECT 
        id,
        name,
        description,
        latitude::float,
        longitude::float,
        radius_meters,
        type,
        status,
        created_at,
        updated_at
      FROM geofences
      WHERE name = $1;
    `;
    const res = await this.db.query<GeofenceEntity>(sql, [name]);
    return res.rows[0] ?? null;
  }

  async findById(id: string): Promise<GeofenceEntity | null> {
    const sql = `
      SELECT 
        id,
        name,
        description,
        latitude::float,
        longitude::float,
        radius_meters,
        type,
        status,
        created_at,
        updated_at
      FROM geofences
      WHERE id = $1;
    `;
    const res = await this.db.query<GeofenceEntity>(sql, [id]);
    return res.rows[0] ?? null;
  }

  async findAll(params: QueryGeofencesDto): Promise<{ items: GeofenceEntity[]; total: number }> {
    const conditions: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (params.type) {
      conditions.push(`type = $${idx++}`);
      values.push(params.type);
    }

    if (params.status) {
      conditions.push(`status = $${idx++}`);
      values.push(params.status);
    }

    if (params.search) {
      conditions.push(`(name ILIKE $${idx} OR description ILIKE $${idx})`);
      values.push(`%${params.search}%`);
      idx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countSql = `
      SELECT COUNT(*)::int AS total
      FROM geofences
      ${whereClause};
    `;
    const countRes = await this.db.query<{ total: number }>(countSql, values);
    const total = countRes.rows[0]?.total ?? 0;

    const dataSql = `
      SELECT 
        id,
        name,
        description,
        latitude::float,
        longitude::float,
        radius_meters,
        type,
        status,
        created_at,
        updated_at
      FROM geofences
      ${whereClause}
      ORDER BY name ASC
      LIMIT $${idx++} OFFSET $${idx++};
    `;
    const dataValues = [...values, params.limit, params.offset];
    const dataRes = await this.db.query<GeofenceEntity>(dataSql, dataValues);

    return {
      items: dataRes.rows,
      total,
    };
  }

  async findActiveGeofences(): Promise<GeofenceEntity[]> {
    const sql = `
      SELECT 
        id,
        name,
        description,
        latitude::float,
        longitude::float,
        radius_meters,
        type,
        status,
        created_at,
        updated_at
      FROM geofences
      WHERE status = 'ACTIVE'
      ORDER BY name ASC;
    `;
    const res = await this.db.query<GeofenceEntity>(sql);
    return res.rows;
  }

  async updateGeofence(id: string, dto: UpdateGeofenceDto): Promise<GeofenceEntity | null> {
    const updates: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (dto.name !== undefined) {
      updates.push(`name = $${idx++}`);
      values.push(dto.name);
    }
    if (dto.description !== undefined) {
      updates.push(`description = $${idx++}`);
      values.push(dto.description);
    }
    if (dto.latitude !== undefined) {
      updates.push(`latitude = $${idx++}`);
      values.push(dto.latitude);
    }
    if (dto.longitude !== undefined) {
      updates.push(`longitude = $${idx++}`);
      values.push(dto.longitude);
    }
    if (dto.radiusMeters !== undefined) {
      updates.push(`radius_meters = $${idx++}`);
      values.push(dto.radiusMeters);
    }
    if (dto.type !== undefined) {
      updates.push(`type = $${idx++}`);
      values.push(dto.type);
    }
    if (dto.status !== undefined) {
      updates.push(`status = $${idx++}`);
      values.push(dto.status);
    }

    if (updates.length === 0) {
      return this.findById(id);
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const sql = `
      UPDATE geofences
      SET ${updates.join(', ')}
      WHERE id = $${idx}
      RETURNING 
        id,
        name,
        description,
        latitude::float,
        longitude::float,
        radius_meters,
        type,
        status,
        created_at,
        updated_at;
    `;

    const res = await this.db.query<GeofenceEntity>(sql, values);
    return res.rows[0] ?? null;
  }

  async deactivateGeofence(id: string): Promise<GeofenceEntity | null> {
    const sql = `
      UPDATE geofences
      SET status = 'INACTIVE', updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING 
        id,
        name,
        description,
        latitude::float,
        longitude::float,
        radius_meters,
        type,
        status,
        created_at,
        updated_at;
    `;
    const res = await this.db.query<GeofenceEntity>(sql, [id]);
    return res.rows[0] ?? null;
  }

  async insertGeofenceEvent(
    event: {
      geofenceId: string;
      vehicleId: string;
      tripId?: string;
      eventType: 'ENTER' | 'EXIT';
      latitude: number;
      longitude: number;
      occurredAt: Date;
    },
    client?: PoolClient,
  ): Promise<GeofenceEventEntity> {
    const sql = `
      INSERT INTO geofence_events (
        geofence_id,
        vehicle_id,
        trip_id,
        event_type,
        latitude,
        longitude,
        occurred_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING 
        id,
        geofence_id,
        vehicle_id,
        trip_id,
        event_type,
        latitude::float,
        longitude::float,
        occurred_at,
        created_at;
    `;
    const values = [
      event.geofenceId,
      event.vehicleId,
      event.tripId ?? null,
      event.eventType,
      event.latitude,
      event.longitude,
      event.occurredAt,
    ];

    if (client) {
      const res = await client.query<GeofenceEventEntity>(sql, values);
      return res.rows[0];
    }
    const res = await this.db.query<GeofenceEventEntity>(sql, values);
    return res.rows[0];
  }

  async findLatestEventForVehicleAndGeofence(
    vehicleId: string,
    geofenceId: string,
  ): Promise<GeofenceEventEntity | null> {
    const sql = `
      SELECT 
        id,
        geofence_id,
        vehicle_id,
        trip_id,
        event_type,
        latitude::float,
        longitude::float,
        occurred_at,
        created_at
      FROM geofence_events
      WHERE vehicle_id = $1 AND geofence_id = $2
      ORDER BY occurred_at DESC
      LIMIT 1;
    `;
    const res = await this.db.query<GeofenceEventEntity>(sql, [vehicleId, geofenceId]);
    return res.rows[0] ?? null;
  }

  async findGeofenceEvents(
    params: QueryGeofenceEventsDto,
  ): Promise<{ items: GeofenceEventEntity[]; total: number }> {
    const conditions: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (params.geofenceId) {
      conditions.push(`ge.geofence_id = $${idx++}`);
      values.push(params.geofenceId);
    }

    if (params.vehicleId) {
      conditions.push(`ge.vehicle_id = $${idx++}`);
      values.push(params.vehicleId);
    }

    if (params.tripId) {
      conditions.push(`ge.trip_id = $${idx++}`);
      values.push(params.tripId);
    }

    if (params.eventType) {
      conditions.push(`ge.event_type = $${idx++}`);
      values.push(params.eventType);
    }

    if (params.startTime) {
      conditions.push(`ge.occurred_at >= $${idx++}`);
      values.push(params.startTime);
    }

    if (params.endTime) {
      conditions.push(`ge.occurred_at <= $${idx++}`);
      values.push(params.endTime);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countSql = `
      SELECT COUNT(*)::int AS total
      FROM geofence_events ge
      ${whereClause};
    `;
    const countRes = await this.db.query<{ total: number }>(countSql, values);
    const total = countRes.rows[0]?.total ?? 0;

    const dataSql = `
      SELECT 
        ge.id,
        ge.geofence_id,
        ge.vehicle_id,
        ge.trip_id,
        ge.event_type,
        ge.latitude::float,
        ge.longitude::float,
        ge.occurred_at,
        ge.created_at,
        g.name AS geofence_name,
        v.vehicle_code
      FROM geofence_events ge
      JOIN geofences g ON ge.geofence_id = g.id
      JOIN vehicles v ON ge.vehicle_id = v.id
      ${whereClause}
      ORDER BY ge.occurred_at DESC
      LIMIT $${idx++} OFFSET $${idx++};
    `;
    const dataValues = [...values, params.limit, params.offset];
    const dataRes = await this.db.query<GeofenceEventEntity>(dataSql, dataValues);

    return {
      items: dataRes.rows,
      total,
    };
  }
}
