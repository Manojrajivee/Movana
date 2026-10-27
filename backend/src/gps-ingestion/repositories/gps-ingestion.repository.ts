import { Injectable, Logger } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../database/database.service';
import { QueryLocationHistoryDto } from '../dto/query-location-history.dto';

export interface LocationHistoryEntity {
  id: string;
  vehicle_id: string;
  trip_id: string | null;
  driver_id: string | null;
  latitude: number;
  longitude: number;
  accuracy_meters: number | null;
  speed_kmh: number;
  heading_degrees: number | null;
  altitude_meters: number | null;
  odometer: number | null;
  recorded_at: Date;
  received_at: Date;
  source: string;
}

export interface TrackingEventEntity {
  id: string;
  device_id: string;
  vehicle_id: string;
  event_type: string;
  payload: Record<string, any>;
  recorded_at: Date;
  created_at: Date;
}

export interface TrackingDeviceLookup {
  id: string;
  device_imei: string;
  vehicle_id: string | null;
  is_active: boolean;
}

@Injectable()
export class GpsIngestionRepository {
  private readonly logger = new Logger(GpsIngestionRepository.name);

  constructor(private readonly db: DatabaseService) {}

  async findDeviceByImei(imei: string): Promise<TrackingDeviceLookup | null> {
    const sql = `
      SELECT id, device_imei, vehicle_id, is_active
      FROM tracking_devices
      WHERE device_imei = $1;
    `;
    const res = await this.db.query<TrackingDeviceLookup>(sql, [imei]);
    return res.rows[0] ?? null;
  }

  async insertLocationPoint(
    point: {
      vehicleId: string;
      tripId?: string;
      driverId?: string;
      latitude: number;
      longitude: number;
      accuracyMeters?: number;
      speedKmh: number;
      headingDegrees?: number;
      altitudeMeters?: number;
      odometer?: number;
      recordedAt: Date;
      source?: string;
    },
    client?: PoolClient,
  ): Promise<LocationHistoryEntity> {
    const sql = `
      INSERT INTO vehicle_location_history (
        vehicle_id,
        trip_id,
        driver_id,
        latitude,
        longitude,
        accuracy_meters,
        speed_kmh,
        heading_degrees,
        altitude_meters,
        odometer,
        recorded_at,
        source
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING 
        id,
        vehicle_id,
        trip_id,
        driver_id,
        latitude::float,
        longitude::float,
        accuracy_meters::float,
        speed_kmh::float,
        heading_degrees::float,
        altitude_meters::float,
        odometer::float,
        recorded_at,
        received_at,
        source;
    `;

    const values = [
      point.vehicleId,
      point.tripId ?? null,
      point.driverId ?? null,
      point.latitude,
      point.longitude,
      point.accuracyMeters ?? null,
      point.speedKmh ?? 0,
      point.headingDegrees ?? null,
      point.altitudeMeters ?? null,
      point.odometer ?? null,
      point.recordedAt,
      point.source ?? 'GPS_DEVICE',
    ];

    if (client) {
      const res = await client.query<LocationHistoryEntity>(sql, values);
      return res.rows[0];
    }
    const res = await this.db.query<LocationHistoryEntity>(sql, values);
    return res.rows[0];
  }

  async updateVehicleTelemetry(
    vehicleId: string,
    lat: number,
    lon: number,
    recordedAt: Date,
    odometer?: number,
    client?: PoolClient,
  ): Promise<void> {
    const sql = `
      UPDATE vehicles
      SET 
        current_latitude = $2,
        current_longitude = $3,
        last_location_at = $4,
        current_odometer = COALESCE($5, current_odometer),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1;
    `;
    const values = [vehicleId, lat, lon, recordedAt, odometer ?? null];

    if (client) {
      await client.query(sql, values);
    } else {
      await this.db.query(sql, values);
    }
  }

  async updateTripTelemetry(
    tripId: string,
    lat: number,
    lon: number,
    client?: PoolClient,
  ): Promise<void> {
    const sql = `
      UPDATE trips
      SET 
        current_latitude = $2,
        current_longitude = $3,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1;
    `;
    const values = [tripId, lat, lon];

    if (client) {
      await client.query(sql, values);
    } else {
      await this.db.query(sql, values);
    }
  }

  async insertTrackingEvent(event: {
    deviceId: string;
    vehicleId: string;
    eventType: string;
    payload: Record<string, any>;
    recordedAt: Date;
  }): Promise<TrackingEventEntity> {
    const sql = `
      INSERT INTO tracking_events (
        device_id,
        vehicle_id,
        event_type,
        payload,
        recorded_at
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, device_id, vehicle_id, event_type, payload, recorded_at, created_at;
    `;
    const values = [
      event.deviceId,
      event.vehicleId,
      event.eventType,
      JSON.stringify(event.payload ?? {}),
      event.recordedAt,
    ];
    const res = await this.db.query<TrackingEventEntity>(sql, values);
    return res.rows[0];
  }

  async findLocationHistory(
    vehicleId: string,
    query: QueryLocationHistoryDto,
  ): Promise<{ items: LocationHistoryEntity[]; total: number }> {
    const conditions = ['vehicle_id = $1'];
    const values: any[] = [vehicleId];
    let idx = 2;

    if (query.startTime) {
      conditions.push(`recorded_at >= $${idx++}`);
      values.push(query.startTime);
    }

    if (query.endTime) {
      conditions.push(`recorded_at <= $${idx++}`);
      values.push(query.endTime);
    }

    if (query.tripId) {
      conditions.push(`trip_id = $${idx++}`);
      values.push(query.tripId);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const countSql = `
      SELECT COUNT(*)::int AS total
      FROM vehicle_location_history
      ${whereClause};
    `;
    const countRes = await this.db.query<{ total: number }>(countSql, values);
    const total = countRes.rows[0]?.total ?? 0;

    const dataSql = `
      SELECT 
        id,
        vehicle_id,
        trip_id,
        driver_id,
        latitude::float,
        longitude::float,
        accuracy_meters::float,
        speed_kmh::float,
        heading_degrees::float,
        altitude_meters::float,
        odometer::float,
        recorded_at,
        received_at,
        source
      FROM vehicle_location_history
      ${whereClause}
      ORDER BY recorded_at DESC
      LIMIT $${idx++} OFFSET $${idx++};
    `;
    const dataValues = [...values, query.limit, query.offset];
    const dataRes = await this.db.query<LocationHistoryEntity>(dataSql, dataValues);

    return {
      items: dataRes.rows,
      total,
    };
  }
}
