import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

export interface TripProgressDetailEntity {
  id: string;
  trip_number: string;
  route_id: string;
  route_code: string;
  route_name: string;
  distance_km: number;
  estimated_duration_minutes: number;
  vehicle_id: string | null;
  vehicle_code?: string;
  registration_number?: string;
  primary_driver_id: string | null;
  driver_name?: string;
  status: string;
  current_stop_id: string | null;
  current_stop_name?: string;
  current_latitude: number | null;
  current_longitude: number | null;
  delay_minutes: number;
  scheduled_departure_at: Date;
  scheduled_arrival_at: Date;
  actual_departure_at: Date | null;
  actual_arrival_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface TripProgressStopEntity {
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

export interface TripMilestoneEntity {
  id: string;
  trip_id: string;
  vehicle_id: string | null;
  driver_id: string | null;
  event_type: string;
  event_data: Record<string, any>;
  occurred_at: Date;
  created_at: Date;
}

export interface LiveBoardItemEntity {
  trip_id: string;
  trip_number: string;
  route_code: string;
  route_name: string;
  origin_stop: string;
  destination_stop: string;
  vehicle_code: string | null;
  registration_number: string | null;
  primary_driver_name: string | null;
  trip_status: string;
  current_stop: string | null;
  delay_minutes: number;
  current_latitude: number | null;
  current_longitude: number | null;
  last_telemetry_at: Date | null;
  total_stops: number;
  completed_stops: number;
}

@Injectable()
export class TripProgressRepository {
  constructor(private readonly db: DatabaseService) {}

  async findTripProgressDetail(tripId: string): Promise<TripProgressDetailEntity | null> {
    const query = `
      SELECT 
        t.id,
        t.trip_number,
        t.route_id,
        r.route_code,
        r.name AS route_name,
        r.distance_km,
        r.estimated_duration_minutes,
        t.vehicle_id,
        v.vehicle_code,
        v.registration_number,
        t.primary_driver_id,
        u.first_name || ' ' || u.last_name AS driver_name,
        t.status,
        t.current_stop_id,
        s_curr.name AS current_stop_name,
        t.current_latitude,
        t.current_longitude,
        t.delay_minutes,
        t.scheduled_departure_at,
        t.scheduled_arrival_at,
        t.actual_departure_at,
        t.actual_arrival_at,
        t.created_at,
        t.updated_at
      FROM trips t
      JOIN routes r ON t.route_id = r.id
      LEFT JOIN vehicles v ON t.vehicle_id = v.id
      LEFT JOIN drivers d ON t.primary_driver_id = d.id
      LEFT JOIN users u ON d.user_id = u.id
      LEFT JOIN stops s_curr ON t.current_stop_id = s_curr.id
      WHERE t.id = $1;
    `;
    const res = await this.db.query<TripProgressDetailEntity>(query, [tripId]);
    return res.rows[0] || null;
  }

  async findTripStops(tripId: string): Promise<TripProgressStopEntity[]> {
    const query = `
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
        s.latitude,
        s.longitude
      FROM trip_stops ts
      JOIN stops s ON ts.stop_id = s.id
      WHERE ts.trip_id = $1
      ORDER BY ts.sequence_number ASC;
    `;
    const res = await this.db.query<TripProgressStopEntity>(query, [tripId]);
    return res.rows;
  }

  async recordMilestoneEvent(
    tripId: string,
    vehicleId: string | null,
    driverId: string | null,
    eventType: string,
    eventData: Record<string, any>,
    occurredAt?: Date,
  ): Promise<TripMilestoneEntity> {
    const query = `
      INSERT INTO trip_events (
        trip_id, vehicle_id, driver_id, event_type, event_data, occurred_at
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *;
    `;
    const res = await this.db.query<TripMilestoneEntity>(query, [
      tripId,
      vehicleId,
      driverId,
      eventType,
      JSON.stringify(eventData || {}),
      occurredAt || new Date(),
    ]);
    return res.rows[0];
  }

  async findTripMilestones(
    tripId: string,
    limit: number = 50,
    eventType?: string,
  ): Promise<TripMilestoneEntity[]> {
    const conditions = ['trip_id = $1'];
    const values: any[] = [tripId];
    let idx = 2;

    if (eventType) {
      conditions.push(`event_type = $${idx++}`);
      values.push(eventType);
    }

    values.push(limit);
    const limitIdx = idx;

    const query = `
      SELECT *
      FROM trip_events
      WHERE ${conditions.join(' AND ')}
      ORDER BY occurred_at DESC
      LIMIT $${limitIdx};
    `;
    const res = await this.db.query<TripMilestoneEntity>(query, values);
    return res.rows;
  }

  async countTripMilestones(tripId: string): Promise<number> {
    const query = `SELECT COUNT(*)::int AS count FROM trip_events WHERE trip_id = $1;`;
    const res = await this.db.query<{ count: number }>(query, [tripId]);
    return res.rows[0]?.count || 0;
  }

  async getActiveLiveBoard(): Promise<LiveBoardItemEntity[]> {
    const query = `
      SELECT 
        vws.trip_id,
        vws.trip_number,
        vws.route_code,
        vws.route_name,
        vws.origin_stop,
        vws.destination_stop,
        vws.vehicle_code,
        vws.registration_number,
        vws.primary_driver_name,
        vws.trip_status,
        vws.current_stop,
        vws.delay_minutes,
        vws.current_latitude,
        vws.current_longitude,
        vws.last_telemetry_at,
        COUNT(ts.id)::int AS total_stops,
        COUNT(CASE WHEN ts.status IN ('ARRIVED', 'DEPARTED') THEN 1 END)::int AS completed_stops
      FROM vw_trip_current_status vws
      LEFT JOIN trip_stops ts ON vws.trip_id = ts.trip_id
      WHERE vws.trip_status IN ('SCHEDULED', 'BOARDING', 'IN_TRANSIT', 'DELAYED')
      GROUP BY 
        vws.trip_id, vws.trip_number, vws.route_code, vws.route_name,
        vws.origin_stop, vws.destination_stop, vws.vehicle_code,
        vws.registration_number, vws.primary_driver_name, vws.trip_status,
        vws.current_stop, vws.delay_minutes, vws.current_latitude,
        vws.current_longitude, vws.last_telemetry_at
      ORDER BY vws.trip_status, vws.trip_number;
    `;
    const res = await this.db.query<LiveBoardItemEntity>(query);
    return res.rows;
  }
}
