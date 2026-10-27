import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../database/database.service';

export interface TripStopDetailEntity {
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
  stop_code: string;
  stop_name: string;
  latitude: number;
  longitude: number;
  city: string;
}

export interface RecentStopArrivalEntity {
  trip_stop_id: string;
  trip_id: string;
  trip_number: string;
  route_code: string;
  route_name: string;
  vehicle_code: string | null;
  sequence_number: number;
  scheduled_arrival_at: Date;
  scheduled_departure_at: Date;
  actual_arrival_at: Date | null;
  actual_departure_at: Date | null;
  delay_minutes: number;
  status: string;
}

@Injectable()
export class StopArrivalsRepository {
  constructor(private readonly db: DatabaseService) {}

  async findTripById(tripId: string): Promise<any | null> {
    const query = `
      SELECT t.*, r.route_code, r.name AS route_name
      FROM trips t
      JOIN routes r ON t.route_id = r.id
      WHERE t.id = $1;
    `;
    const res = await this.db.query(query, [tripId]);
    return res.rows[0] || null;
  }

  async findTripStop(tripId: string, stopId: string): Promise<TripStopDetailEntity | null> {
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
      WHERE ts.trip_id = $1 AND ts.stop_id = $2;
    `;
    const res = await this.db.query<TripStopDetailEntity>(query, [tripId, stopId]);
    return res.rows[0] || null;
  }

  async findAllTripStops(tripId: string): Promise<TripStopDetailEntity[]> {
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
    const res = await this.db.query<TripStopDetailEntity>(query, [tripId]);
    return res.rows;
  }

  async findStopById(stopId: string): Promise<any | null> {
    const query = `SELECT * FROM stops WHERE id = $1;`;
    const res = await this.db.query(query, [stopId]);
    return res.rows[0] || null;
  }

  async recordArrivalTransactional(
    tripId: string,
    stopId: string,
    arrivedAt: Date,
    delayMinutes: number,
    notes?: string,
    userId?: string,
  ): Promise<TripStopDetailEntity> {
    return this.db.withTransaction(async (client: PoolClient) => {
      // 1. Lock trip
      const tripRes = await client.query(`SELECT * FROM trips WHERE id = $1 FOR UPDATE;`, [tripId]);
      const trip = tripRes.rows[0];

      // 2. Update trip_stops
      const updateStopSql = `
        UPDATE trip_stops
        SET 
          actual_arrival_at = $1,
          status = 'ARRIVED',
          delay_minutes = $2,
          updated_at = CURRENT_TIMESTAMP
        WHERE trip_id = $3 AND stop_id = $4
        RETURNING *;
      `;
      await client.query(updateStopSql, [arrivedAt, delayMinutes, tripId, stopId]);

      // 3. Update trips current stop and status
      let newTripStatus = trip.status;
      if (['SCHEDULED', 'BOARDING'].includes(trip.status)) {
        newTripStatus = 'IN_TRANSIT';
      }

      const updateTripSql = `
        UPDATE trips
        SET 
          current_stop_id = $1,
          delay_minutes = $2,
          status = $3,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $4;
      `;
      await client.query(updateTripSql, [stopId, delayMinutes, newTripStatus, tripId]);

      // 4. Log status change if updated
      if (newTripStatus !== trip.status) {
        const histSql = `
          INSERT INTO trip_status_history (
            trip_id, old_status, new_status, reason, changed_by
          ) VALUES ($1, $2, $3, 'Status transitioned upon arrival at stop', $4);
        `;
        await client.query(histSql, [tripId, trip.status, newTripStatus, userId || null]);
      }

      // 5. Record milestone event
      const eventSql = `
        INSERT INTO trip_events (
          trip_id, vehicle_id, driver_id, event_type, event_data, occurred_at
        ) VALUES ($1, $2, $3, 'STOP_ARRIVED', $4, $5);
      `;
      await client.query(eventSql, [
        tripId,
        trip.vehicle_id,
        trip.primary_driver_id,
        JSON.stringify({
          stopId,
          arrivedAt,
          delayMinutes,
          notes: notes || null,
        }),
        arrivedAt,
      ]);

      // Return stop details
      const stopDetailRes = await client.query<TripStopDetailEntity>(
        `
        SELECT ts.*, s.stop_code, s.name AS stop_name, s.latitude, s.longitude, s.city
        FROM trip_stops ts
        JOIN stops s ON ts.stop_id = s.id
        WHERE ts.trip_id = $1 AND ts.stop_id = $2;
        `,
        [tripId, stopId],
      );
      return stopDetailRes.rows[0];
    });
  }

  async recordDepartureTransactional(
    tripId: string,
    stopId: string,
    departedAt: Date,
    isFirstStop: boolean,
    isLastStop: boolean,
    notes?: string,
    userId?: string,
  ): Promise<TripStopDetailEntity> {
    return this.db.withTransaction(async (client: PoolClient) => {
      // 1. Lock trip
      const tripRes = await client.query(`SELECT * FROM trips WHERE id = $1 FOR UPDATE;`, [tripId]);
      const trip = tripRes.rows[0];

      // 2. Update trip_stops
      const updateStopSql = `
        UPDATE trip_stops
        SET 
          actual_departure_at = $1,
          status = 'DEPARTED',
          updated_at = CURRENT_TIMESTAMP
        WHERE trip_id = $2 AND stop_id = $3
        RETURNING *;
      `;
      await client.query(updateStopSql, [departedAt, tripId, stopId]);

      // 3. Update trip status if first stop or last stop
      let newTripStatus = trip.status;
      const tripFields: string[] = ['updated_at = CURRENT_TIMESTAMP'];
      const tripParams: any[] = [];
      let idx = 1;

      if (isFirstStop && !trip.actual_departure_at) {
        tripFields.push(`actual_departure_at = $${idx++}`);
        tripParams.push(departedAt);
        newTripStatus = 'IN_TRANSIT';
      }

      if (isLastStop) {
        tripFields.push(`actual_arrival_at = $${idx++}`);
        tripParams.push(departedAt);
        newTripStatus = 'COMPLETED';
      }

      if (newTripStatus !== trip.status) {
        tripFields.push(`status = $${idx++}`);
        tripParams.push(newTripStatus);
      }

      tripParams.push(tripId);
      const updateTripSql = `
        UPDATE trips
        SET ${tripFields.join(', ')}
        WHERE id = $${idx};
      `;
      await client.query(updateTripSql, tripParams);

      // 4. Log status change if updated
      if (newTripStatus !== trip.status) {
        const histSql = `
          INSERT INTO trip_status_history (
            trip_id, old_status, new_status, reason, changed_by
          ) VALUES ($1, $2, $3, $4, $5);
        `;
        const reason = isLastStop
          ? 'Trip completed at final destination stop'
          : 'Trip departed origin terminal';
        await client.query(histSql, [tripId, trip.status, newTripStatus, reason, userId || null]);
      }

      // 5. Record milestone event
      const eventSql = `
        INSERT INTO trip_events (
          trip_id, vehicle_id, driver_id, event_type, event_data, occurred_at
        ) VALUES ($1, $2, $3, 'STOP_DEPARTED', $4, $5);
      `;
      await client.query(eventSql, [
        tripId,
        trip.vehicle_id,
        trip.primary_driver_id,
        JSON.stringify({
          stopId,
          departedAt,
          isFirstStop,
          isLastStop,
          notes: notes || null,
        }),
        departedAt,
      ]);

      const stopDetailRes = await client.query<TripStopDetailEntity>(
        `
        SELECT ts.*, s.stop_code, s.name AS stop_name, s.latitude, s.longitude, s.city
        FROM trip_stops ts
        JOIN stops s ON ts.stop_id = s.id
        WHERE ts.trip_id = $1 AND ts.stop_id = $2;
        `,
        [tripId, stopId],
      );
      return stopDetailRes.rows[0];
    });
  }

  async recordSkipTransactional(
    tripId: string,
    stopId: string,
    reason: string,
    userId?: string,
  ): Promise<TripStopDetailEntity> {
    return this.db.withTransaction(async (client: PoolClient) => {
      const tripRes = await client.query(`SELECT * FROM trips WHERE id = $1 FOR UPDATE;`, [tripId]);
      const trip = tripRes.rows[0];

      const updateStopSql = `
        UPDATE trip_stops
        SET status = 'SKIPPED', updated_at = CURRENT_TIMESTAMP
        WHERE trip_id = $1 AND stop_id = $2
        RETURNING *;
      `;
      await client.query(updateStopSql, [tripId, stopId]);

      const eventSql = `
        INSERT INTO trip_events (
          trip_id, vehicle_id, driver_id, event_type, event_data, occurred_at
        ) VALUES ($1, $2, $3, 'STOP_SKIPPED', $4, CURRENT_TIMESTAMP);
      `;
      await client.query(eventSql, [
        tripId,
        trip.vehicle_id,
        trip.primary_driver_id,
        JSON.stringify({
          stopId,
          reason,
          skippedBy: userId || null,
        }),
      ]);

      const stopDetailRes = await client.query<TripStopDetailEntity>(
        `
        SELECT ts.*, s.stop_code, s.name AS stop_name, s.latitude, s.longitude, s.city
        FROM trip_stops ts
        JOIN stops s ON ts.stop_id = s.id
        WHERE ts.trip_id = $1 AND ts.stop_id = $2;
        `,
        [tripId, stopId],
      );
      return stopDetailRes.rows[0];
    });
  }

  async findRecentStopArrivals(
    stopId: string,
    hours: number = 4,
    limit: number = 20,
  ): Promise<RecentStopArrivalEntity[]> {
    const query = `
      SELECT 
        ts.id AS trip_stop_id,
        ts.trip_id,
        t.trip_number,
        r.route_code,
        r.name AS route_name,
        v.vehicle_code,
        ts.sequence_number,
        ts.scheduled_arrival_at,
        ts.scheduled_departure_at,
        ts.actual_arrival_at,
        ts.actual_departure_at,
        ts.delay_minutes,
        ts.status
      FROM trip_stops ts
      JOIN trips t ON ts.trip_id = t.id
      JOIN routes r ON t.route_id = r.id
      LEFT JOIN vehicles v ON t.vehicle_id = v.id
      WHERE ts.stop_id = $1
        AND (
          ts.actual_arrival_at >= NOW() - ($2 || ' hours')::interval
          OR ts.actual_departure_at >= NOW() - ($2 || ' hours')::interval
        )
      ORDER BY COALESCE(ts.actual_arrival_at, ts.actual_departure_at) DESC
      LIMIT $3;
    `;
    const res = await this.db.query<RecentStopArrivalEntity>(query, [stopId, hours, limit]);
    return res.rows;
  }
}
