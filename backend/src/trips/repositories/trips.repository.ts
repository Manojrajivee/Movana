import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../database/database.service';
import { QueryTripsDto } from '../dto/query-trips.dto';

export interface TripEntity {
  id: string;
  trip_number: string;
  route_id: string;
  schedule_id: string | null;
  vehicle_id: string | null;
  primary_driver_id: string | null;
  secondary_driver_id: string | null;
  scheduled_departure_at: Date;
  scheduled_arrival_at: Date;
  actual_departure_at: Date | null;
  actual_arrival_at: Date | null;
  status: string;
  current_stop_id: string | null;
  current_latitude: number | null;
  current_longitude: number | null;
  delay_minutes: number;
  created_at: Date;
  updated_at: Date;
  // Joined details
  route_code?: string;
  route_name?: string;
  vehicle_code?: string;
  registration_number?: string;
  primary_driver_name?: string;
  secondary_driver_name?: string;
  current_stop_name?: string;
  stops_count?: number;
}

export interface TripStopEntity {
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
  created_at: Date;
  updated_at: Date;
  // Joined stop details
  stop_code?: string;
  stop_name?: string;
  latitude?: number;
  longitude?: number;
  city?: string;
}

@Injectable()
export class TripsRepository {
  constructor(private readonly db: DatabaseService) {}

  async findTripById(id: string): Promise<TripEntity | null> {
    const query = `
      SELECT 
        t.*,
        r.route_code,
        r.name AS route_name,
        v.vehicle_code,
        v.registration_number,
        u1.first_name || ' ' || u1.last_name AS primary_driver_name,
        u2.first_name || ' ' || u2.last_name AS secondary_driver_name,
        s_curr.name AS current_stop_name,
        (SELECT COUNT(*)::int FROM trip_stops ts WHERE ts.trip_id = t.id) AS stops_count
      FROM trips t
      JOIN routes r ON t.route_id = r.id
      LEFT JOIN vehicles v ON t.vehicle_id = v.id
      LEFT JOIN drivers d1 ON t.primary_driver_id = d1.id
      LEFT JOIN users u1 ON d1.user_id = u1.id
      LEFT JOIN drivers d2 ON t.secondary_driver_id = d2.id
      LEFT JOIN users u2 ON d2.user_id = u2.id
      LEFT JOIN stops s_curr ON t.current_stop_id = s_curr.id
      WHERE t.id = $1;
    `;
    const res = await this.db.query<TripEntity>(query, [id]);
    return res.rows[0] || null;
  }

  async findTripByNumber(tripNumber: string): Promise<TripEntity | null> {
    const query = `
      SELECT t.*, r.route_code, r.name AS route_name
      FROM trips t
      JOIN routes r ON t.route_id = r.id
      WHERE t.trip_number = $1;
    `;
    const res = await this.db.query<TripEntity>(query, [tripNumber]);
    return res.rows[0] || null;
  }

  async findTripStops(tripId: string): Promise<TripStopEntity[]> {
    const query = `
      SELECT 
        ts.*,
        s.stop_code,
        s.name AS stop_name,
        s.latitude,
        s.longitude,
        s.city
      FROM trip_stops ts
      JOIN stops s ON ts.stop_id = s.id
      WHERE ts.trip_id = $1
      ORDER BY ts.sequence_number ASC;
    `;
    const res = await this.db.query<TripStopEntity>(query, [tripId]);
    return res.rows;
  }

  async findScheduleById(scheduleId: string): Promise<any | null> {
    const query = `
      SELECT ts.*, r.route_code, r.name AS route_name, sc.calendar_name
      FROM trip_schedules ts
      JOIN routes r ON ts.route_id = r.id
      JOIN service_calendars sc ON ts.service_calendar_id = sc.id
      WHERE ts.id = $1;
    `;
    const res = await this.db.query(query, [scheduleId]);
    return res.rows[0] || null;
  }

  async findScheduleStops(scheduleId: string): Promise<any[]> {
    const query = `
      SELECT ss.*, s.stop_code, s.name AS stop_name, s.latitude, s.longitude
      FROM schedule_stops ss
      JOIN stops s ON ss.stop_id = s.id
      WHERE ss.schedule_id = $1
      ORDER BY ss.sequence_number ASC;
    `;
    const res = await this.db.query(query, [scheduleId]);
    return res.rows;
  }

  async findRouteById(routeId: string): Promise<any | null> {
    const query = `
      SELECT * FROM routes WHERE id = $1 AND deleted_at IS NULL;
    `;
    const res = await this.db.query(query, [routeId]);
    return res.rows[0] || null;
  }

  async findRouteStops(routeId: string): Promise<any[]> {
    const query = `
      SELECT rs.*, s.stop_code, s.name AS stop_name, s.latitude, s.longitude
      FROM route_stops rs
      JOIN stops s ON rs.stop_id = s.id
      WHERE rs.route_id = $1
      ORDER BY rs.sequence_number ASC;
    `;
    const res = await this.db.query(query, [routeId]);
    return res.rows;
  }

  async findVehicleById(vehicleId: string): Promise<any | null> {
    const query = `SELECT * FROM vehicles WHERE id = $1;`;
    const res = await this.db.query(query, [vehicleId]);
    return res.rows[0] || null;
  }

  async findDriverById(driverId: string): Promise<any | null> {
    const query = `SELECT * FROM drivers WHERE id = $1;`;
    const res = await this.db.query(query, [driverId]);
    return res.rows[0] || null;
  }

  async queryTrips(params: QueryTripsDto): Promise<{ trips: TripEntity[]; total: number }> {
    const conditions: string[] = ['1=1'];
    const values: any[] = [];
    let idx = 1;

    if (params.routeId) {
      conditions.push(`t.route_id = $${idx++}`);
      values.push(params.routeId);
    }
    if (params.scheduleId) {
      conditions.push(`t.schedule_id = $${idx++}`);
      values.push(params.scheduleId);
    }
    if (params.vehicleId) {
      conditions.push(`t.vehicle_id = $${idx++}`);
      values.push(params.vehicleId);
    }
    if (params.driverId) {
      conditions.push(`(t.primary_driver_id = $${idx} OR t.secondary_driver_id = $${idx})`);
      idx++;
      values.push(params.driverId);
    }
    if (params.status) {
      conditions.push(`t.status = $${idx++}`);
      values.push(params.status);
    }
    if (params.date) {
      conditions.push(`DATE(t.scheduled_departure_at) = $${idx++}`);
      values.push(params.date);
    }
    if (params.search) {
      conditions.push(
        `(t.trip_number ILIKE $${idx} OR r.route_code ILIKE $${idx} OR r.name ILIKE $${idx})`,
      );
      idx++;
      values.push(`%${params.search}%`);
    }

    const whereClause = conditions.join(' AND ');

    const countQuery = `
      SELECT COUNT(*)::int AS total
      FROM trips t
      JOIN routes r ON t.route_id = r.id
      WHERE ${whereClause};
    `;
    const countRes = await this.db.query<{ total: number }>(countQuery, values);
    const total = countRes.rows[0]?.total || 0;

    const offset = (params.page - 1) * params.limit;
    values.push(params.limit);
    const limitIdx = idx++;
    values.push(offset);
    const offsetIdx = idx++;

    const selectQuery = `
      SELECT 
        t.*,
        r.route_code,
        r.name AS route_name,
        v.vehicle_code,
        v.registration_number,
        u1.first_name || ' ' || u1.last_name AS primary_driver_name,
        u2.first_name || ' ' || u2.last_name AS secondary_driver_name,
        s_curr.name AS current_stop_name,
        (SELECT COUNT(*)::int FROM trip_stops ts WHERE ts.trip_id = t.id) AS stops_count
      FROM trips t
      JOIN routes r ON t.route_id = r.id
      LEFT JOIN vehicles v ON t.vehicle_id = v.id
      LEFT JOIN drivers d1 ON t.primary_driver_id = d1.id
      LEFT JOIN users u1 ON d1.user_id = u1.id
      LEFT JOIN drivers d2 ON t.secondary_driver_id = d2.id
      LEFT JOIN users u2 ON d2.user_id = u2.id
      LEFT JOIN stops s_curr ON t.current_stop_id = s_curr.id
      WHERE ${whereClause}
      ORDER BY t.scheduled_departure_at DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx};
    `;

    const tripsRes = await this.db.query<TripEntity>(selectQuery, values);
    return { trips: tripsRes.rows, total };
  }

  async createTripWithStops(
    tripData: {
      tripNumber: string;
      routeId: string;
      scheduleId?: string | null;
      vehicleId?: string | null;
      primaryDriverId?: string | null;
      secondaryDriverId?: string | null;
      scheduledDepartureAt: Date;
      scheduledArrivalAt: Date;
      status?: string;
    },
    stopsData: Array<{
      stopId: string;
      sequenceNumber: number;
      scheduledArrivalAt: Date;
      scheduledDepartureAt: Date;
    }>,
    userId?: string,
  ): Promise<TripEntity> {
    return this.db.withTransaction(async (client: PoolClient) => {
      // 1. Insert Trip
      const insertTripSql = `
        INSERT INTO trips (
          trip_number, route_id, schedule_id, vehicle_id,
          primary_driver_id, secondary_driver_id,
          scheduled_departure_at, scheduled_arrival_at, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *;
      `;
      const tripRes = await client.query<TripEntity>(insertTripSql, [
        tripData.tripNumber,
        tripData.routeId,
        tripData.scheduleId || null,
        tripData.vehicleId || null,
        tripData.primaryDriverId || null,
        tripData.secondaryDriverId || null,
        tripData.scheduledDepartureAt,
        tripData.scheduledArrivalAt,
        tripData.status || 'SCHEDULED',
      ]);
      const trip = tripRes.rows[0];

      // 2. Insert Trip Stops
      if (stopsData.length > 0) {
        for (const stop of stopsData) {
          const insertStopSql = `
            INSERT INTO trip_stops (
              trip_id, stop_id, sequence_number, scheduled_arrival_at, scheduled_departure_at, status
            ) VALUES ($1, $2, $3, $4, $5, 'PENDING');
          `;
          await client.query(insertStopSql, [
            trip.id,
            stop.stopId,
            stop.sequenceNumber,
            stop.scheduledArrivalAt,
            stop.scheduledDepartureAt,
          ]);
        }
      }

      // 3. Insert Status History
      const insertStatusHistSql = `
        INSERT INTO trip_status_history (
          trip_id, old_status, new_status, reason, changed_by
        ) VALUES ($1, 'NONE', $2, 'Initial trip dispatch', $3);
      `;
      await client.query(insertStatusHistSql, [trip.id, trip.status, userId || null]);

      // 4. Record milestone in trip_events
      const insertEventSql = `
        INSERT INTO trip_events (
          trip_id, vehicle_id, driver_id, event_type, event_data
        ) VALUES ($1, $2, $3, 'TRIP_DISPATCHED', $4);
      `;
      await client.query(insertEventSql, [
        trip.id,
        trip.vehicle_id,
        trip.primary_driver_id,
        JSON.stringify({
          tripNumber: trip.trip_number,
          dispatchType: trip.schedule_id ? 'SCHEDULED' : 'AD_HOC',
          stopsCount: stopsData.length,
        }),
      ]);

      return trip;
    });
  }

  async updateTrip(
    id: string,
    updates: {
      vehicleId?: string | null;
      primaryDriverId?: string | null;
      secondaryDriverId?: string | null;
      scheduledDepartureAt?: Date;
      scheduledArrivalAt?: Date;
    },
  ): Promise<TripEntity | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (updates.vehicleId !== undefined) {
      fields.push(`vehicle_id = $${idx++}`);
      values.push(updates.vehicleId);
    }
    if (updates.primaryDriverId !== undefined) {
      fields.push(`primary_driver_id = $${idx++}`);
      values.push(updates.primaryDriverId);
    }
    if (updates.secondaryDriverId !== undefined) {
      fields.push(`secondary_driver_id = $${idx++}`);
      values.push(updates.secondaryDriverId);
    }
    if (updates.scheduledDepartureAt !== undefined) {
      fields.push(`scheduled_departure_at = $${idx++}`);
      values.push(updates.scheduledDepartureAt);
    }
    if (updates.scheduledArrivalAt !== undefined) {
      fields.push(`scheduled_arrival_at = $${idx++}`);
      values.push(updates.scheduledArrivalAt);
    }

    if (fields.length === 0) {
      return this.findTripById(id);
    }

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);
    const sql = `
      UPDATE trips
      SET ${fields.join(', ')}
      WHERE id = $${idx}
      RETURNING *;
    `;
    const res = await this.db.query<TripEntity>(sql, values);
    return res.rows[0] || null;
  }

  async cancelTrip(id: string, reason: string, cancelledBy?: string): Promise<TripEntity> {
    return this.db.withTransaction(async (client: PoolClient) => {
      const getTripSql = `SELECT * FROM trips WHERE id = $1 FOR UPDATE;`;
      const tripRes = await client.query<TripEntity>(getTripSql, [id]);
      const trip = tripRes.rows[0];

      const updateTripSql = `
        UPDATE trips
        SET status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *;
      `;
      const updatedRes = await client.query<TripEntity>(updateTripSql, [id]);

      const histSql = `
        INSERT INTO trip_status_history (
          trip_id, old_status, new_status, reason, changed_by
        ) VALUES ($1, $2, 'CANCELLED', $3, $4);
      `;
      await client.query(histSql, [id, trip.status, reason, cancelledBy || null]);

      const eventSql = `
        INSERT INTO trip_events (
          trip_id, vehicle_id, driver_id, event_type, event_data
        ) VALUES ($1, $2, $3, 'TRIP_CANCELLED', $4);
      `;
      await client.query(eventSql, [
        id,
        trip.vehicle_id,
        trip.primary_driver_id,
        JSON.stringify({ reason }),
      ]);

      return updatedRes.rows[0];
    });
  }
}
