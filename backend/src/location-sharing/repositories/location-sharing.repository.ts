import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { PublicLocationResponse } from '../dto/public-location.dto';

@Injectable()
export class LocationSharingRepository {
  private readonly logger = new Logger(LocationSharingRepository.name);

  constructor(private readonly db: DatabaseService) {}

  async validateTripExists(tripId: string): Promise<boolean> {
    const query = `SELECT 1 FROM trips WHERE id = $1;`;
    const res = await this.db.query(query, [tripId]);
    return res.rows.length > 0;
  }

  async validateUserTripAuthorization(
    userId: string,
    tripId: string,
    roles: string[] = [],
  ): Promise<boolean> {
    // 1. Staff override: Operations and Admin roles have broad operational authority
    if (roles.includes('ADMIN') || roles.includes('OPERATOR') || roles.includes('SAFETY_OFFICER')) {
      return true;
    }

    // 2. Passenger Booking verification: User must have an active booking on the trip
    const bookingQuery = `
      SELECT 1
      FROM bookings
      WHERE user_id = $1
        AND trip_id = $2
        AND status != 'CANCELLED'
      LIMIT 1;
    `;
    const bookingRes = await this.db.query(bookingQuery, [userId, tripId]);
    if (bookingRes.rows.length > 0) {
      return true;
    }

    // 3. Driver assignment verification: User is assigned driver for the trip
    const driverQuery = `
      SELECT 1
      FROM trips t
      JOIN drivers d ON (t.primary_driver_id = d.id OR t.secondary_driver_id = d.id)
      WHERE t.id = $2
        AND d.user_id = $1
      LIMIT 1;
    `;
    const driverRes = await this.db.query(driverQuery, [userId, tripId]);
    if (driverRes.rows.length > 0) {
      return true;
    }

    // 4. Module 41 SOS integration: Passenger with an active emergency on the trip
    const emergencyQuery = `
      SELECT 1
      FROM emergency_events
      WHERE user_id = $1
        AND trip_id = $2
        AND status IN ('TRIGGERED', 'DISPATCHED')
      LIMIT 1;
    `;
    const emergencyRes = await this.db.query(emergencyQuery, [userId, tripId]);
    if (emergencyRes.rows.length > 0) {
      return true;
    }

    return false;
  }

  async findTripLocation(
    tripId: string,
  ): Promise<Omit<PublicLocationResponse, 'expiresAt'> | null> {
    // Attempt query against real-time operational status view
    const viewQuery = `
      SELECT
        trip_id,
        trip_number,
        route_code,
        route_name,
        origin_stop,
        destination_stop,
        current_latitude::float,
        current_longitude::float,
        trip_status,
        delay_minutes,
        last_telemetry_at
      FROM vw_trip_current_status
      WHERE trip_id = $1;
    `;
    const viewRes = await this.db.query<{
      trip_id: string;
      trip_number: string;
      route_code: string;
      route_name: string;
      origin_stop: string;
      destination_stop: string;
      current_latitude: number | null;
      current_longitude: number | null;
      trip_status: string;
      delay_minutes: number;
      last_telemetry_at: Date | null;
    }>(viewQuery, [tripId]);

    if (viewRes.rows.length > 0) {
      const row = viewRes.rows[0];
      return {
        tripId: row.trip_id,
        tripNumber: row.trip_number,
        routeCode: row.route_code,
        routeName: row.route_name,
        originStop: row.origin_stop,
        destinationStop: row.destination_stop,
        currentLatitude: row.current_latitude,
        currentLongitude: row.current_longitude,
        tripStatus: row.trip_status,
        delayMinutes: row.delay_minutes || 0,
        lastTelemetryAt: row.last_telemetry_at
          ? new Date(row.last_telemetry_at).toISOString()
          : null,
      };
    }

    // Fallback directly to trips table if view does not return a row (e.g. stops not linked)
    const tripQuery = `
      SELECT
        t.id AS trip_id,
        t.trip_number,
        r.route_code,
        r.name AS route_name,
        t.current_latitude::float,
        t.current_longitude::float,
        t.status AS trip_status,
        t.delay_minutes,
        t.updated_at AS last_telemetry_at
      FROM trips t
      LEFT JOIN routes r ON t.route_id = r.id
      WHERE t.id = $1;
    `;
    const tripRes = await this.db.query<{
      trip_id: string;
      trip_number: string;
      route_code: string | null;
      route_name: string | null;
      current_latitude: number | null;
      current_longitude: number | null;
      trip_status: string;
      delay_minutes: number;
      last_telemetry_at: Date | null;
    }>(tripQuery, [tripId]);

    if (tripRes.rows.length > 0) {
      const row = tripRes.rows[0];
      return {
        tripId: row.trip_id,
        tripNumber: row.trip_number,
        routeCode: row.route_code || undefined,
        routeName: row.route_name || undefined,
        currentLatitude: row.current_latitude,
        currentLongitude: row.current_longitude,
        tripStatus: row.trip_status,
        delayMinutes: row.delay_minutes || 0,
        lastTelemetryAt: row.last_telemetry_at
          ? new Date(row.last_telemetry_at).toISOString()
          : null,
      };
    }

    return null;
  }
}
