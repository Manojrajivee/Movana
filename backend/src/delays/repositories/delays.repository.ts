import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

export interface TripDelayDetails {
  trip_id: string;
  trip_number: string;
  route_id: string;
  route_code: string;
  route_name: string;
  vehicle_id: string | null;
  vehicle_code: string | null;
  primary_driver_id: string | null;
  status: string;
  delay_minutes: number;
  scheduled_departure_at: Date;
  scheduled_arrival_at: Date;
  actual_departure_at: Date | null;
  actual_arrival_at: Date | null;
}

export interface DelayedTripItem {
  trip_id: string;
  trip_number: string;
  route_id: string;
  route_code: string;
  route_name: string;
  vehicle_id: string | null;
  vehicle_code: string | null;
  status: string;
  delay_minutes: number;
  scheduled_departure_at: Date;
  scheduled_arrival_at: Date;
  current_latitude: number | null;
  current_longitude: number | null;
}

export interface RouteDelaySummary {
  route_id: string;
  route_code: string;
  route_name: string;
  delayed_trips: number;
  average_delay: number;
}

export interface NetworkDelaySummary {
  totalActiveTrips: number;
  delayedTripsCount: number;
  onTimeTripsCount: number;
  onTimePerformanceRate: number;
  averageDelayMinutes: number;
  maxDelayMinutes: number;
  topDelayedRoutes: RouteDelaySummary[];
}

@Injectable()
export class DelaysRepository {
  private readonly logger = new Logger(DelaysRepository.name);

  constructor(private readonly db: DatabaseService) {}

  async findTripForDelay(tripId: string): Promise<TripDelayDetails | null> {
    const sql = `
      SELECT 
        t.id AS trip_id,
        t.trip_number,
        t.route_id,
        r.route_code,
        r.name AS route_name,
        t.vehicle_id,
        v.vehicle_code,
        t.primary_driver_id,
        t.status,
        t.delay_minutes,
        t.scheduled_departure_at,
        t.scheduled_arrival_at,
        t.actual_departure_at,
        t.actual_arrival_at
      FROM trips t
      JOIN routes r ON t.route_id = r.id
      LEFT JOIN vehicles v ON t.vehicle_id = v.id
      WHERE t.id = $1;
    `;
    const res = await this.db.query<TripDelayDetails>(sql, [tripId]);
    return res.rows[0] ?? null;
  }

  async updateTripDelay(
    tripId: string,
    delayMinutes: number,
    newStatus?: string,
  ): Promise<TripDelayDetails | null> {
    const sql = `
      UPDATE trips
      SET 
        delay_minutes = $2,
        status = COALESCE($3, status),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING 
        id AS trip_id,
        trip_number,
        route_id,
        vehicle_id,
        primary_driver_id,
        status,
        delay_minutes,
        scheduled_departure_at,
        scheduled_arrival_at,
        actual_departure_at,
        actual_arrival_at;
    `;
    const res = await this.db.query<TripDelayDetails>(sql, [
      tripId,
      delayMinutes,
      newStatus ?? null,
    ]);
    return res.rows[0] ?? null;
  }

  async recordTripEvent(
    tripId: string,
    vehicleId: string | null,
    driverId: string | null,
    eventType: string,
    eventData: Record<string, any>,
  ): Promise<void> {
    const sql = `
      INSERT INTO trip_events (
        trip_id,
        vehicle_id,
        driver_id,
        event_type,
        event_data,
        occurred_at
      ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP);
    `;
    await this.db.query(sql, [tripId, vehicleId, driverId, eventType, JSON.stringify(eventData)]);
  }

  async recordTripStatusHistory(
    tripId: string,
    oldStatus: string,
    newStatus: string,
    reason: string | null,
    changedBy: string | null,
  ): Promise<void> {
    const sql = `
      INSERT INTO trip_status_history (
        trip_id,
        old_status,
        new_status,
        reason,
        changed_by,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP);
    `;
    await this.db.query(sql, [tripId, oldStatus, newStatus, reason, changedBy]);
  }

  async findActiveDelayedTrips(params: {
    minDelayMinutes: number;
    routeId?: string;
    vehicleId?: string;
    limit: number;
    offset: number;
  }): Promise<{ items: DelayedTripItem[]; total: number }> {
    const conditions: string[] = [
      "(t.status = 'DELAYED' OR t.delay_minutes >= $1)",
      "t.status IN ('SCHEDULED', 'BOARDING', 'IN_TRANSIT', 'DELAYED')",
    ];
    const values: any[] = [params.minDelayMinutes];

    if (params.routeId) {
      values.push(params.routeId);
      conditions.push(`t.route_id = $${values.length}`);
    }

    if (params.vehicleId) {
      values.push(params.vehicleId);
      conditions.push(`t.vehicle_id = $${values.length}`);
    }

    const whereClause = conditions.join(' AND ');

    const countSql = `
      SELECT COUNT(*)::int AS total
      FROM trips t
      WHERE ${whereClause};
    `;
    const countRes = await this.db.query<{ total: number }>(countSql, values);
    const total = countRes.rows[0]?.total ?? 0;

    const dataValues = [...values, params.limit, params.offset];
    const dataSql = `
      SELECT 
        t.id AS trip_id,
        t.trip_number,
        t.route_id,
        r.route_code,
        r.name AS route_name,
        t.vehicle_id,
        v.vehicle_code,
        t.status,
        t.delay_minutes,
        t.scheduled_departure_at,
        t.scheduled_arrival_at,
        t.current_latitude::float,
        t.current_longitude::float
      FROM trips t
      JOIN routes r ON t.route_id = r.id
      LEFT JOIN vehicles v ON t.vehicle_id = v.id
      WHERE ${whereClause}
      ORDER BY t.delay_minutes DESC, t.scheduled_departure_at ASC
      LIMIT $${dataValues.length - 1} OFFSET $${dataValues.length};
    `;
    const dataRes = await this.db.query<DelayedTripItem>(dataSql, dataValues);

    return {
      items: dataRes.rows,
      total,
    };
  }

  async getDelaySummary(): Promise<NetworkDelaySummary> {
    const metricSql = `
      SELECT 
        COUNT(*)::int AS total_active_trips,
        COUNT(*) FILTER (WHERE t.status = 'DELAYED' OR t.delay_minutes >= 5)::int AS delayed_trips_count,
        COALESCE(AVG(t.delay_minutes) FILTER (WHERE t.delay_minutes > 0), 0)::float AS average_delay_minutes,
        COALESCE(MAX(t.delay_minutes), 0)::int AS max_delay_minutes
      FROM trips t
      WHERE t.status IN ('SCHEDULED', 'BOARDING', 'IN_TRANSIT', 'DELAYED');
    `;
    const metricRes = await this.db.query<{
      total_active_trips: number;
      delayed_trips_count: number;
      average_delay_minutes: number;
      max_delay_minutes: number;
    }>(metricSql);

    const metrics = metricRes.rows[0] ?? {
      total_active_trips: 0,
      delayed_trips_count: 0,
      average_delay_minutes: 0,
      max_delay_minutes: 0,
    };

    const routesSql = `
      SELECT 
        r.id AS route_id,
        r.route_code,
        r.name AS route_name,
        COUNT(t.id)::int AS delayed_trips,
        COALESCE(AVG(t.delay_minutes), 0)::float AS average_delay
      FROM trips t
      JOIN routes r ON t.route_id = r.id
      WHERE (t.status = 'DELAYED' OR t.delay_minutes >= 5)
        AND t.status IN ('SCHEDULED', 'BOARDING', 'IN_TRANSIT', 'DELAYED')
      GROUP BY r.id, r.route_code, r.name
      ORDER BY delayed_trips DESC, average_delay DESC
      LIMIT 5;
    `;
    const routesRes = await this.db.query<RouteDelaySummary>(routesSql);

    const totalActive = metrics.total_active_trips;
    const delayedCount = metrics.delayed_trips_count;
    const onTimeCount = Math.max(0, totalActive - delayedCount);
    const onTimePerformanceRate =
      totalActive > 0 ? parseFloat(((onTimeCount / totalActive) * 100).toFixed(2)) : 100.0;

    return {
      totalActiveTrips: totalActive,
      delayedTripsCount: delayedCount,
      onTimeTripsCount: onTimeCount,
      onTimePerformanceRate,
      averageDelayMinutes: parseFloat(metrics.average_delay_minutes.toFixed(1)),
      maxDelayMinutes: metrics.max_delay_minutes,
      topDelayedRoutes: routesRes.rows.map((r) => ({
        ...r,
        average_delay: parseFloat(r.average_delay.toFixed(1)),
      })),
    };
  }
}
