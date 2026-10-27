import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { NearbyVehiclesDto } from '../dto/nearby-vehicles.dto';
import { QueryTrackingVehiclesDto } from '../dto/query-tracking-vehicles.dto';

export interface ActiveVehicleLocationEntity {
  vehicle_id: string;
  vehicle_code: string;
  registration_number: string;
  vehicle_type: string;
  vehicle_status: string;
  current_latitude: number | null;
  current_longitude: number | null;
  last_location_at: Date | null;
  current_odometer: number;
  fuel_type: string;
  device_imei: string | null;
  active_trip_id: string | null;
  active_trip_number: string | null;
  active_trip_status: string | null;
  distance_km?: number;
}

export interface TripCurrentStatusEntity {
  trip_id: string;
  trip_number: string;
  route_code: string;
  route_name: string;
  origin_stop: string;
  destination_stop: string;
  vehicle_code: string | null;
  registration_number: string | null;
  primary_driver_name: string | null;
  driver_phone: string | null;
  scheduled_departure_at: Date;
  scheduled_arrival_at: Date;
  actual_departure_at: Date | null;
  actual_arrival_at: Date | null;
  delay_minutes: number;
  trip_status: string;
  current_stop: string | null;
  current_latitude: number | null;
  current_longitude: number | null;
  last_telemetry_at: Date;
}

@Injectable()
export class TrackingRepository {
  private readonly logger = new Logger(TrackingRepository.name);

  constructor(private readonly db: DatabaseService) {}

  async findActiveVehicles(params: QueryTrackingVehiclesDto): Promise<{
    items: ActiveVehicleLocationEntity[];
    total: number;
  }> {
    const conditions: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (params.vehicleStatus) {
      conditions.push(`vehicle_status = $${idx++}`);
      values.push(params.vehicleStatus);
    }

    if (params.vehicleType) {
      conditions.push(`vehicle_type ILIKE $${idx++}`);
      values.push(`%${params.vehicleType}%`);
    }

    if (params.search) {
      conditions.push(
        `(vehicle_code ILIKE $${idx} OR registration_number ILIKE $${idx} OR device_imei ILIKE $${idx})`,
      );
      values.push(`%${params.search}%`);
      idx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countSql = `
      SELECT COUNT(*)::int AS total
      FROM vw_active_vehicle_locations
      ${whereClause};
    `;
    const countRes = await this.db.query<{ total: number }>(countSql, values);
    const total = countRes.rows[0]?.total ?? 0;

    const dataSql = `
      SELECT 
        vehicle_id,
        vehicle_code,
        registration_number,
        vehicle_type,
        vehicle_status,
        current_latitude::float,
        current_longitude::float,
        last_location_at,
        current_odometer::float,
        fuel_type,
        device_imei,
        active_trip_id,
        active_trip_number,
        active_trip_status
      FROM vw_active_vehicle_locations
      ${whereClause}
      ORDER BY vehicle_code ASC
      LIMIT $${idx++} OFFSET $${idx++};
    `;
    const dataValues = [...values, params.limit, params.offset];
    const dataRes = await this.db.query<ActiveVehicleLocationEntity>(dataSql, dataValues);

    return {
      items: dataRes.rows,
      total,
    };
  }

  async findVehicleTrackingById(vehicleId: string): Promise<ActiveVehicleLocationEntity | null> {
    const sql = `
      SELECT 
        vehicle_id,
        vehicle_code,
        registration_number,
        vehicle_type,
        vehicle_status,
        current_latitude::float,
        current_longitude::float,
        last_location_at,
        current_odometer::float,
        fuel_type,
        device_imei,
        active_trip_id,
        active_trip_number,
        active_trip_status
      FROM vw_active_vehicle_locations
      WHERE vehicle_id = $1;
    `;
    const res = await this.db.query<ActiveVehicleLocationEntity>(sql, [vehicleId]);
    return res.rows[0] ?? null;
  }

  async findTripTrackingById(tripId: string): Promise<TripCurrentStatusEntity | null> {
    const sql = `
      SELECT 
        trip_id,
        trip_number,
        route_code,
        route_name,
        origin_stop,
        destination_stop,
        vehicle_code,
        registration_number,
        primary_driver_name,
        driver_phone,
        scheduled_departure_at,
        scheduled_arrival_at,
        actual_departure_at,
        actual_arrival_at,
        delay_minutes,
        trip_status,
        current_stop,
        current_latitude::float,
        current_longitude::float,
        last_telemetry_at
      FROM vw_trip_current_status
      WHERE trip_id = $1;
    `;
    const res = await this.db.query<TripCurrentStatusEntity>(sql, [tripId]);
    return res.rows[0] ?? null;
  }

  async findNearbyVehicles(params: NearbyVehiclesDto): Promise<ActiveVehicleLocationEntity[]> {
    const sql = `
      SELECT 
        vehicle_id,
        vehicle_code,
        registration_number,
        vehicle_type,
        vehicle_status,
        current_latitude::float,
        current_longitude::float,
        last_location_at,
        current_odometer::float,
        fuel_type,
        device_imei,
        active_trip_id,
        active_trip_number,
        active_trip_status,
        ROUND((
          6371 * acos(
            LEAST(1.0, GREATEST(-1.0,
              cos(radians($1)) * cos(radians(current_latitude)) *
              cos(radians(current_longitude) - radians($2)) +
              sin(radians($1)) * sin(radians(current_latitude))
            ))
          )
        )::numeric, 2)::float AS distance_km
      FROM vw_active_vehicle_locations
      WHERE current_latitude IS NOT NULL 
        AND current_longitude IS NOT NULL
        AND (
          6371 * acos(
            LEAST(1.0, GREATEST(-1.0,
              cos(radians($1)) * cos(radians(current_latitude)) *
              cos(radians(current_longitude) - radians($2)) +
              sin(radians($1)) * sin(radians(current_latitude))
            ))
          )
        ) <= $3
      ORDER BY distance_km ASC
      LIMIT $4;
    `;
    const res = await this.db.query<ActiveVehicleLocationEntity>(sql, [
      params.latitude,
      params.longitude,
      params.radiusKm,
      params.limit,
    ]);
    return res.rows;
  }
}
