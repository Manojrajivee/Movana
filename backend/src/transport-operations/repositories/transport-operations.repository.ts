import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../database/database.service';

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
  route_code?: string;
  route_name?: string;
  vehicle_registration_number?: string;
  vehicle_code?: string;
  primary_driver_badge?: string;
  secondary_driver_badge?: string;
}

export interface TripAssignmentEntity {
  id: string;
  trip_id: string;
  driver_id: string;
  vehicle_id: string;
  assignment_type: string;
  assigned_at: Date;
  status: string;
  created_at: Date;
  updated_at: Date;
  driver_badge?: string;
  vehicle_registration_number?: string;
}

export interface TripEventEntity {
  id: string;
  trip_id: string;
  vehicle_id: string | null;
  driver_id: string | null;
  event_type: string;
  event_data: Record<string, any>;
  occurred_at: Date;
  created_at: Date;
}

export interface TripStatusHistoryEntity {
  id: string;
  trip_id: string;
  old_status: string;
  new_status: string;
  reason: string | null;
  changed_by: string | null;
  created_at: Date;
}

export interface DispatchSummary {
  totalTrips: number;
  scheduledTrips: number;
  inTransitTrips: number;
  completedTrips: number;
  delayedTrips: number;
  cancelledTrips: number;
  activeVehicles: number;
  activeDrivers: number;
}

@Injectable()
export class TransportOperationsRepository {
  constructor(private readonly db: DatabaseService) {}

  async createTrip(
    data: {
      tripNumber: string;
      routeId: string;
      scheduleId?: string | null;
      vehicleId?: string | null;
      primaryDriverId?: string | null;
      secondaryDriverId?: string | null;
      scheduledDepartureAt: string;
      scheduledArrivalAt: string;
      status?: string;
    },
    client?: PoolClient,
  ): Promise<TripEntity> {
    const query = `
      INSERT INTO trips (
        trip_number,
        route_id,
        schedule_id,
        vehicle_id,
        primary_driver_id,
        secondary_driver_id,
        scheduled_departure_at,
        scheduled_arrival_at,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;
    const params = [
      data.tripNumber,
      data.routeId,
      data.scheduleId ?? null,
      data.vehicleId ?? null,
      data.primaryDriverId ?? null,
      data.secondaryDriverId ?? null,
      data.scheduledDepartureAt,
      data.scheduledArrivalAt,
      data.status ?? 'SCHEDULED',
    ];

    const result = client
      ? await client.query<TripEntity>(query, params)
      : await this.db.query<TripEntity>(query, params);

    return result.rows[0];
  }

  async findTripById(id: string, client?: PoolClient): Promise<TripEntity | null> {
    const query = `
      SELECT
        t.*,
        r.route_code,
        r.name AS route_name,
        v.registration_number AS vehicle_registration_number,
        v.vehicle_code,
        pd.badge_number AS primary_driver_badge,
        sd.badge_number AS secondary_driver_badge
      FROM trips t
      LEFT JOIN routes r ON r.id = t.route_id
      LEFT JOIN vehicles v ON v.id = t.vehicle_id
      LEFT JOIN drivers pd ON pd.id = t.primary_driver_id
      LEFT JOIN drivers sd ON sd.id = t.secondary_driver_id
      WHERE t.id = $1
    `;
    const result = client
      ? await client.query<TripEntity>(query, [id])
      : await this.db.query<TripEntity>(query, [id]);

    return result.rows[0] ?? null;
  }

  async findTripByNumber(tripNumber: string, client?: PoolClient): Promise<TripEntity | null> {
    const query = `SELECT * FROM trips WHERE UPPER(trip_number) = UPPER($1)`;
    const result = client
      ? await client.query<TripEntity>(query, [tripNumber])
      : await this.db.query<TripEntity>(query, [tripNumber]);

    return result.rows[0] ?? null;
  }

  async findRouteById(
    id: string,
    client?: PoolClient,
  ): Promise<{ id: string; route_code: string; name: string; status: string } | null> {
    const query = `SELECT id, route_code, name, status FROM routes WHERE id = $1`;
    const result = client
      ? await client.query<{ id: string; route_code: string; name: string; status: string }>(
          query,
          [id],
        )
      : await this.db.query<{ id: string; route_code: string; name: string; status: string }>(
          query,
          [id],
        );

    return result.rows[0] ?? null;
  }

  async findTrips(
    options: {
      status?: string;
      routeId?: string;
      vehicleId?: string;
      driverId?: string;
      date?: string;
      limit: number;
      offset: number;
    },
    client?: PoolClient,
  ): Promise<{ trips: TripEntity[]; total: number }> {
    const conditions: string[] = ['1=1'];
    const params: (string | number)[] = [];
    let paramIndex = 1;

    if (options.status) {
      conditions.push(`t.status = $${paramIndex++}`);
      params.push(options.status);
    }

    if (options.routeId) {
      conditions.push(`t.route_id = $${paramIndex++}`);
      params.push(options.routeId);
    }

    if (options.vehicleId) {
      conditions.push(`t.vehicle_id = $${paramIndex++}`);
      params.push(options.vehicleId);
    }

    if (options.driverId) {
      conditions.push(
        `(t.primary_driver_id = $${paramIndex} OR t.secondary_driver_id = $${paramIndex})`,
      );
      params.push(options.driverId);
      paramIndex++;
    }

    if (options.date) {
      conditions.push(`t.scheduled_departure_at::date = $${paramIndex++}::date`);
      params.push(options.date);
    }

    const whereClause = conditions.join(' AND ');

    const countQuery = `
      SELECT COUNT(*)::int AS total
      FROM trips t
      WHERE ${whereClause}
    `;

    const countResult = client
      ? await client.query<{ total: number }>(countQuery, params)
      : await this.db.query<{ total: number }>(countQuery, params);

    const total = countResult.rows[0]?.total ?? 0;

    const dataQuery = `
      SELECT
        t.*,
        r.route_code,
        r.name AS route_name,
        v.registration_number AS vehicle_registration_number,
        v.vehicle_code,
        pd.badge_number AS primary_driver_badge,
        sd.badge_number AS secondary_driver_badge
      FROM trips t
      LEFT JOIN routes r ON r.id = t.route_id
      LEFT JOIN vehicles v ON v.id = t.vehicle_id
      LEFT JOIN drivers pd ON pd.id = t.primary_driver_id
      LEFT JOIN drivers sd ON sd.id = t.secondary_driver_id
      WHERE ${whereClause}
      ORDER BY t.scheduled_departure_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;

    const dataParams = [...params, options.limit, options.offset];
    const dataResult = client
      ? await client.query<TripEntity>(dataQuery, dataParams)
      : await this.db.query<TripEntity>(dataQuery, dataParams);

    return { trips: dataResult.rows, total };
  }

  async updateTripStatus(
    id: string,
    data: {
      status: string;
      actualDepartureAt?: Date | null;
      actualArrivalAt?: Date | null;
      delayMinutes?: number;
      currentStopId?: string | null;
      currentLatitude?: number | null;
      currentLongitude?: number | null;
    },
    client?: PoolClient,
  ): Promise<TripEntity | null> {
    const fields: string[] = ['status = $1', 'updated_at = CURRENT_TIMESTAMP'];
    const params: any[] = [data.status];
    let idx = 2;

    if (data.actualDepartureAt !== undefined) {
      fields.push(`actual_departure_at = $${idx++}`);
      params.push(data.actualDepartureAt);
    }

    if (data.actualArrivalAt !== undefined) {
      fields.push(`actual_arrival_at = $${idx++}`);
      params.push(data.actualArrivalAt);
    }

    if (data.delayMinutes !== undefined) {
      fields.push(`delay_minutes = $${idx++}`);
      params.push(data.delayMinutes);
    }

    if (data.currentStopId !== undefined) {
      fields.push(`current_stop_id = $${idx++}`);
      params.push(data.currentStopId);
    }

    if (data.currentLatitude !== undefined) {
      fields.push(`current_latitude = $${idx++}`);
      params.push(data.currentLatitude);
    }

    if (data.currentLongitude !== undefined) {
      fields.push(`current_longitude = $${idx++}`);
      params.push(data.currentLongitude);
    }

    params.push(id);
    const query = `
      UPDATE trips
      SET ${fields.join(', ')}
      WHERE id = $${idx}
      RETURNING *
    `;

    const result = client
      ? await client.query<TripEntity>(query, params)
      : await this.db.query<TripEntity>(query, params);

    return result.rows[0] ?? null;
  }

  async updateTripCrew(
    id: string,
    data: {
      vehicleId?: string;
      primaryDriverId?: string;
      secondaryDriverId?: string;
    },
    client?: PoolClient,
  ): Promise<TripEntity | null> {
    const fields: string[] = ['updated_at = CURRENT_TIMESTAMP'];
    const params: any[] = [];
    let idx = 1;

    if (data.vehicleId !== undefined) {
      fields.push(`vehicle_id = $${idx++}`);
      params.push(data.vehicleId);
    }

    if (data.primaryDriverId !== undefined) {
      fields.push(`primary_driver_id = $${idx++}`);
      params.push(data.primaryDriverId);
    }

    if (data.secondaryDriverId !== undefined) {
      fields.push(`secondary_driver_id = $${idx++}`);
      params.push(data.secondaryDriverId);
    }

    params.push(id);
    const query = `
      UPDATE trips
      SET ${fields.join(', ')}
      WHERE id = $${idx}
      RETURNING *
    `;

    const result = client
      ? await client.query<TripEntity>(query, params)
      : await this.db.query<TripEntity>(query, params);

    return result.rows[0] ?? null;
  }

  async recordStatusHistory(
    data: {
      tripId: string;
      oldStatus: string;
      newStatus: string;
      reason?: string | null;
      changedBy?: string | null;
    },
    client?: PoolClient,
  ): Promise<TripStatusHistoryEntity> {
    const query = `
      INSERT INTO trip_status_history (
        trip_id,
        old_status,
        new_status,
        reason,
        changed_by
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    const params = [
      data.tripId,
      data.oldStatus,
      data.newStatus,
      data.reason ?? null,
      data.changedBy ?? null,
    ];

    const result = client
      ? await client.query<TripStatusHistoryEntity>(query, params)
      : await this.db.query<TripStatusHistoryEntity>(query, params);

    return result.rows[0];
  }

  async findStatusHistoryByTripId(
    tripId: string,
    client?: PoolClient,
  ): Promise<TripStatusHistoryEntity[]> {
    const query = `
      SELECT *
      FROM trip_status_history
      WHERE trip_id = $1
      ORDER BY created_at ASC
    `;
    const result = client
      ? await client.query<TripStatusHistoryEntity>(query, [tripId])
      : await this.db.query<TripStatusHistoryEntity>(query, [tripId]);

    return result.rows;
  }

  async createTripAssignment(
    data: {
      tripId: string;
      driverId: string;
      vehicleId: string;
      assignmentType?: string;
      status?: string;
    },
    client?: PoolClient,
  ): Promise<TripAssignmentEntity> {
    const query = `
      INSERT INTO trip_assignments (
        trip_id,
        driver_id,
        vehicle_id,
        assignment_type,
        status
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    const params = [
      data.tripId,
      data.driverId,
      data.vehicleId,
      data.assignmentType ?? 'PRIMARY_DRIVER',
      data.status ?? 'ACTIVE',
    ];

    const result = client
      ? await client.query<TripAssignmentEntity>(query, params)
      : await this.db.query<TripAssignmentEntity>(query, params);

    return result.rows[0];
  }

  async findTripAssignments(tripId: string, client?: PoolClient): Promise<TripAssignmentEntity[]> {
    const query = `
      SELECT
        ta.*,
        d.badge_number AS driver_badge,
        v.registration_number AS vehicle_registration_number
      FROM trip_assignments ta
      JOIN drivers d ON d.id = ta.driver_id
      JOIN vehicles v ON v.id = ta.vehicle_id
      WHERE ta.trip_id = $1
      ORDER BY ta.assigned_at DESC
    `;
    const result = client
      ? await client.query<TripAssignmentEntity>(query, [tripId])
      : await this.db.query<TripAssignmentEntity>(query, [tripId]);

    return result.rows;
  }

  async createTripEvent(
    data: {
      tripId: string;
      vehicleId?: string | null;
      driverId?: string | null;
      eventType: string;
      eventData?: Record<string, any>;
      occurredAt?: string;
    },
    client?: PoolClient,
  ): Promise<TripEventEntity> {
    const query = `
      INSERT INTO trip_events (
        trip_id,
        vehicle_id,
        driver_id,
        event_type,
        event_data,
        occurred_at
      )
      VALUES ($1, $2, $3, $4, $5, COALESCE($6::timestamptz, CURRENT_TIMESTAMP))
      RETURNING *
    `;
    const params = [
      data.tripId,
      data.vehicleId ?? null,
      data.driverId ?? null,
      data.eventType,
      JSON.stringify(data.eventData ?? {}),
      data.occurredAt ?? null,
    ];

    const result = client
      ? await client.query<TripEventEntity>(query, params)
      : await this.db.query<TripEventEntity>(query, params);

    return result.rows[0];
  }

  async findTripEvents(tripId: string, client?: PoolClient): Promise<TripEventEntity[]> {
    const query = `
      SELECT *
      FROM trip_events
      WHERE trip_id = $1
      ORDER BY occurred_at DESC
    `;
    const result = client
      ? await client.query<TripEventEntity>(query, [tripId])
      : await this.db.query<TripEventEntity>(query, [tripId]);

    return result.rows;
  }

  async getDispatchSummary(client?: PoolClient): Promise<DispatchSummary> {
    const query = `
      SELECT
        COUNT(*)::int AS total_trips,
        COUNT(*) FILTER (WHERE status = 'SCHEDULED')::int AS scheduled_trips,
        COUNT(*) FILTER (WHERE status IN ('BOARDING', 'DEPARTED', 'IN_TRANSIT'))::int AS in_transit_trips,
        COUNT(*) FILTER (WHERE status IN ('ARRIVED', 'COMPLETED'))::int AS completed_trips,
        COUNT(*) FILTER (WHERE status = 'DELAYED' OR delay_minutes > 15)::int AS delayed_trips,
        COUNT(*) FILTER (WHERE status IN ('CANCELLED', 'SUSPENDED'))::int AS cancelled_trips,
        COUNT(DISTINCT vehicle_id) FILTER (WHERE status IN ('BOARDING', 'DEPARTED', 'IN_TRANSIT'))::int AS active_vehicles,
        COUNT(DISTINCT primary_driver_id) FILTER (WHERE status IN ('BOARDING', 'DEPARTED', 'IN_TRANSIT'))::int AS active_drivers
      FROM trips
      WHERE scheduled_departure_at::date = CURRENT_DATE
    `;

    const result = client
      ? await client.query<{
          total_trips: number;
          scheduled_trips: number;
          in_transit_trips: number;
          completed_trips: number;
          delayed_trips: number;
          cancelled_trips: number;
          active_vehicles: number;
          active_drivers: number;
        }>(query)
      : await this.db.query<{
          total_trips: number;
          scheduled_trips: number;
          in_transit_trips: number;
          completed_trips: number;
          delayed_trips: number;
          cancelled_trips: number;
          active_vehicles: number;
          active_drivers: number;
        }>(query);

    const row = result.rows[0] ?? {
      total_trips: 0,
      scheduled_trips: 0,
      in_transit_trips: 0,
      completed_trips: 0,
      delayed_trips: 0,
      cancelled_trips: 0,
      active_vehicles: 0,
      active_drivers: 0,
    };

    return {
      totalTrips: Number(row.total_trips),
      scheduledTrips: Number(row.scheduled_trips),
      inTransitTrips: Number(row.in_transit_trips),
      completedTrips: Number(row.completed_trips),
      delayedTrips: Number(row.delayed_trips),
      cancelledTrips: Number(row.cancelled_trips),
      activeVehicles: Number(row.active_vehicles),
      activeDrivers: Number(row.active_drivers),
    };
  }
}
