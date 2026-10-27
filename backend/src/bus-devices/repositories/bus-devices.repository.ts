import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../database/database.service';

export interface TrackingDeviceEntity {
  id: string;
  device_imei: string;
  device_model: string;
  firmware_version: string | null;
  vehicle_id: string | null;
  is_active: boolean;
  installed_at: Date | null;
  created_at: Date;
  updated_at: Date;
  // Joined vehicle details
  vehicle_code?: string | null;
  registration_number?: string | null;
  vehicle_status?: string | null;
}

export interface VehicleRefEntity {
  id: string;
  vehicle_code: string;
  registration_number: string;
  status: string;
}

@Injectable()
export class BusDevicesRepository {
  constructor(private readonly db: DatabaseService) {}

  async createDevice(
    data: {
      deviceImei: string;
      deviceModel: string;
      firmwareVersion?: string;
      vehicleId?: string;
      isActive?: boolean;
    },
    client?: PoolClient,
  ): Promise<TrackingDeviceEntity> {
    const query = `
      INSERT INTO tracking_devices (
        device_imei,
        device_model,
        firmware_version,
        vehicle_id,
        is_active,
        installed_at
      )
      VALUES ($1, $2, $3, $4, $5, CASE WHEN $4 IS NOT NULL THEN CURRENT_TIMESTAMP ELSE NULL END)
      RETURNING *
    `;
    const params = [
      data.deviceImei,
      data.deviceModel,
      data.firmwareVersion ?? null,
      data.vehicleId ?? null,
      data.isActive ?? true,
    ];

    const result = client
      ? await client.query<TrackingDeviceEntity>(query, params)
      : await this.db.query<TrackingDeviceEntity>(query, params);

    return result.rows[0];
  }

  async findById(id: string, client?: PoolClient): Promise<TrackingDeviceEntity | null> {
    const query = `
      SELECT
        td.*,
        v.vehicle_code,
        v.registration_number,
        v.status AS vehicle_status
      FROM tracking_devices td
      LEFT JOIN vehicles v ON v.id = td.vehicle_id
      WHERE td.id = $1
    `;
    const result = client
      ? await client.query<TrackingDeviceEntity>(query, [id])
      : await this.db.query<TrackingDeviceEntity>(query, [id]);

    return result.rows[0] ?? null;
  }

  async findByImei(imei: string, client?: PoolClient): Promise<TrackingDeviceEntity | null> {
    const query = `
      SELECT
        td.*,
        v.vehicle_code,
        v.registration_number,
        v.status AS vehicle_status
      FROM tracking_devices td
      LEFT JOIN vehicles v ON v.id = td.vehicle_id
      WHERE td.device_imei = $1
    `;
    const result = client
      ? await client.query<TrackingDeviceEntity>(query, [imei])
      : await this.db.query<TrackingDeviceEntity>(query, [imei]);

    return result.rows[0] ?? null;
  }

  async findActiveByVehicleId(
    vehicleId: string,
    client?: PoolClient,
  ): Promise<TrackingDeviceEntity | null> {
    const query = `
      SELECT *
      FROM tracking_devices
      WHERE vehicle_id = $1 AND is_active = TRUE
      LIMIT 1
    `;
    const result = client
      ? await client.query<TrackingDeviceEntity>(query, [vehicleId])
      : await this.db.query<TrackingDeviceEntity>(query, [vehicleId]);

    return result.rows[0] ?? null;
  }

  async findVehicleById(vehicleId: string, client?: PoolClient): Promise<VehicleRefEntity | null> {
    const query = `
      SELECT id, vehicle_code, registration_number, status
      FROM vehicles
      WHERE id = $1
    `;
    const result = client
      ? await client.query<VehicleRefEntity>(query, [vehicleId])
      : await this.db.query<VehicleRefEntity>(query, [vehicleId]);

    return result.rows[0] ?? null;
  }

  async findAll(params: {
    vehicleId?: string;
    isActive?: boolean;
    search?: string;
    limit: number;
    offset: number;
  }): Promise<{ items: TrackingDeviceEntity[]; total: number }> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (params.vehicleId) {
      conditions.push(`td.vehicle_id = $${idx++}`);
      values.push(params.vehicleId);
    }

    if (params.isActive !== undefined) {
      conditions.push(`td.is_active = $${idx++}`);
      values.push(params.isActive);
    }

    if (params.search) {
      conditions.push(
        `(td.device_imei ILIKE $${idx} OR td.device_model ILIKE $${idx} OR v.registration_number ILIKE $${idx})`,
      );
      values.push(`%${params.search}%`);
      idx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countQuery = `
      SELECT COUNT(td.id)::int AS count
      FROM tracking_devices td
      LEFT JOIN vehicles v ON v.id = td.vehicle_id
      ${whereClause}
    `;
    const countResult = await this.db.query<{ count: number }>(countQuery, values);
    const total = countResult.rows[0]?.count ?? 0;

    const dataQuery = `
      SELECT
        td.*,
        v.vehicle_code,
        v.registration_number,
        v.status AS vehicle_status
      FROM tracking_devices td
      LEFT JOIN vehicles v ON v.id = td.vehicle_id
      ${whereClause}
      ORDER BY td.created_at DESC
      LIMIT $${idx++} OFFSET $${idx++}
    `;
    values.push(params.limit, params.offset);

    const dataResult = await this.db.query<TrackingDeviceEntity>(dataQuery, values);

    return { items: dataResult.rows, total };
  }

  async updateDevice(
    id: string,
    data: {
      deviceModel?: string;
      firmwareVersion?: string;
      isActive?: boolean;
    },
    client?: PoolClient,
  ): Promise<TrackingDeviceEntity | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (data.deviceModel !== undefined) {
      fields.push(`device_model = $${idx++}`);
      values.push(data.deviceModel);
    }

    if (data.firmwareVersion !== undefined) {
      fields.push(`firmware_version = $${idx++}`);
      values.push(data.firmwareVersion);
    }

    if (data.isActive !== undefined) {
      fields.push(`is_active = $${idx++}`);
      values.push(data.isActive);
    }

    if (fields.length === 0) {
      return this.findById(id, client);
    }

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const query = `
      UPDATE tracking_devices
      SET ${fields.join(', ')}
      WHERE id = $${idx}
      RETURNING *
    `;

    const result = client
      ? await client.query<TrackingDeviceEntity>(query, values)
      : await this.db.query<TrackingDeviceEntity>(query, values);

    return result.rows[0] ?? null;
  }

  async pairDevice(
    id: string,
    vehicleId: string,
    client?: PoolClient,
  ): Promise<TrackingDeviceEntity | null> {
    const query = `
      UPDATE tracking_devices
      SET
        vehicle_id = $2,
        installed_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;
    const result = client
      ? await client.query<TrackingDeviceEntity>(query, [id, vehicleId])
      : await this.db.query<TrackingDeviceEntity>(query, [id, vehicleId]);

    return result.rows[0] ?? null;
  }

  async unpairDevice(id: string, client?: PoolClient): Promise<TrackingDeviceEntity | null> {
    const query = `
      UPDATE tracking_devices
      SET
        vehicle_id = NULL,
        installed_at = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;
    const result = client
      ? await client.query<TrackingDeviceEntity>(query, [id])
      : await this.db.query<TrackingDeviceEntity>(query, [id]);

    return result.rows[0] ?? null;
  }

  async decommissionDevice(id: string, client?: PoolClient): Promise<TrackingDeviceEntity | null> {
    const query = `
      UPDATE tracking_devices
      SET
        is_active = FALSE,
        vehicle_id = NULL,
        installed_at = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;
    const result = client
      ? await client.query<TrackingDeviceEntity>(query, [id])
      : await this.db.query<TrackingDeviceEntity>(query, [id]);

    return result.rows[0] ?? null;
  }

  async getLatestTelemetry(vehicleId: string): Promise<{
    latitude: number;
    longitude: number;
    speed_kmh: number;
    recorded_at: Date;
  } | null> {
    const query = `
      SELECT latitude, longitude, speed_kmh, recorded_at
      FROM vehicle_location_history
      WHERE vehicle_id = $1
      ORDER BY recorded_at DESC
      LIMIT 1
    `;
    const result = await this.db.query<{
      latitude: number;
      longitude: number;
      speed_kmh: number;
      recorded_at: Date;
    }>(query, [vehicleId]);

    return result.rows[0] ?? null;
  }
}
