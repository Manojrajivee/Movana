import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

export interface TripEtaLookupEntity {
  trip_id: string;
  trip_number: string;
  route_id: string;
  route_code: string;
  route_name: string;
  vehicle_id: string | null;
  vehicle_code: string | null;
  vehicle_lat: number | null;
  vehicle_lon: number | null;
  trip_lat: number | null;
  trip_lon: number | null;
  status: string;
  delay_minutes: number;
  scheduled_departure_at: Date;
  scheduled_arrival_at: Date;
}

export interface TripStopEtaDetailEntity {
  id: string;
  trip_id: string;
  stop_id: string;
  sequence_number: number;
  scheduled_arrival_at: Date;
  scheduled_departure_at: Date;
  actual_arrival_at: Date | null;
  actual_departure_at: Date | null;
  delay_minutes: number;
  status: string;
  stop_code: string;
  stop_name: string;
  latitude: number;
  longitude: number;
}

export interface StopApproachingTripEntity {
  trip_id: string;
  trip_number: string;
  route_code: string;
  route_name: string;
  vehicle_code: string | null;
  sequence_number: number;
  scheduled_arrival_at: Date;
  trip_status: string;
  current_latitude: number | null;
  current_longitude: number | null;
  stop_latitude: number;
  stop_longitude: number;
}

@Injectable()
export class EtaRepository {
  private readonly logger = new Logger(EtaRepository.name);

  constructor(private readonly db: DatabaseService) {}

  async findTripForEta(tripId: string): Promise<TripEtaLookupEntity | null> {
    const sql = `
      SELECT 
        t.id AS trip_id,
        t.trip_number,
        t.route_id,
        r.route_code,
        r.name AS route_name,
        t.vehicle_id,
        v.vehicle_code,
        v.current_latitude::float AS vehicle_lat,
        v.current_longitude::float AS vehicle_lon,
        t.current_latitude::float AS trip_lat,
        t.current_longitude::float AS trip_lon,
        t.status,
        t.delay_minutes,
        t.scheduled_departure_at,
        t.scheduled_arrival_at
      FROM trips t
      JOIN routes r ON t.route_id = r.id
      LEFT JOIN vehicles v ON t.vehicle_id = v.id
      WHERE t.id = $1;
    `;
    const res = await this.db.query<TripEtaLookupEntity>(sql, [tripId]);
    return res.rows[0] ?? null;
  }

  async findTripStopsForEta(tripId: string): Promise<TripStopEtaDetailEntity[]> {
    const sql = `
      SELECT 
        ts.id,
        ts.trip_id,
        ts.stop_id,
        ts.sequence_number,
        ts.scheduled_arrival_at,
        ts.scheduled_departure_at,
        ts.actual_arrival_at,
        ts.actual_departure_at,
        ts.delay_minutes,
        ts.status,
        s.stop_code,
        s.name AS stop_name,
        s.latitude::float,
        s.longitude::float
      FROM trip_stops ts
      JOIN stops s ON ts.stop_id = s.id
      WHERE ts.trip_id = $1
      ORDER BY ts.sequence_number ASC;
    `;
    const res = await this.db.query<TripStopEtaDetailEntity>(sql, [tripId]);
    return res.rows;
  }

  async findApproachingTripsForStop(stopId: string): Promise<StopApproachingTripEntity[]> {
    const sql = `
      SELECT 
        t.id AS trip_id,
        t.trip_number,
        r.route_code,
        r.name AS route_name,
        v.vehicle_code,
        ts.sequence_number,
        ts.scheduled_arrival_at,
        t.status AS trip_status,
        COALESCE(v.current_latitude, t.current_latitude)::float AS current_latitude,
        COALESCE(v.current_longitude, t.current_longitude)::float AS current_longitude,
        s.latitude::float AS stop_latitude,
        s.longitude::float AS stop_longitude
      FROM trip_stops ts
      JOIN trips t ON ts.trip_id = t.id
      JOIN routes r ON t.route_id = r.id
      JOIN stops s ON ts.stop_id = s.id
      LEFT JOIN vehicles v ON t.vehicle_id = v.id
      WHERE ts.stop_id = $1
        AND ts.status = 'PENDING'
        AND t.status IN ('SCHEDULED', 'BOARDING', 'IN_TRANSIT', 'DELAYED')
      ORDER BY ts.scheduled_arrival_at ASC
      LIMIT 20;
    `;
    const res = await this.db.query<StopApproachingTripEntity>(sql, [stopId]);
    return res.rows;
  }
}
