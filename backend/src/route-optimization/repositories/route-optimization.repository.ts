import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

export interface RouteDetailEntity {
  id: string;
  route_code: string;
  name: string;
  distance_km: number;
  estimated_duration_minutes: number;
  status: string;
}

export interface RouteStopSequenceEntity {
  stop_id: string;
  stop_code: string;
  stop_name: string;
  sequence_number: number;
  latitude: number;
  longitude: number;
}

export interface HourlyDelayEntity {
  hour_of_day: number;
  trips_count: number;
  avg_delay_minutes: number;
  max_delay_minutes: number;
  on_time_percentage: number;
}

export interface CongestionHotspotEntity {
  route_id: string;
  route_code: string;
  from_stop_id: string;
  from_stop_name: string;
  to_stop_id: string;
  to_stop_name: string;
  sample_size: number;
  avg_delay_minutes: number;
  congestion_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

@Injectable()
export class RouteOptimizationRepository {
  constructor(private readonly db: DatabaseService) {}

  async findRouteById(routeId: string): Promise<RouteDetailEntity | null> {
    const query = `
      SELECT id, route_code, name, distance_km::float, estimated_duration_minutes, status
      FROM routes
      WHERE id = $1 AND deleted_at IS NULL;
    `;
    const res = await this.db.query<RouteDetailEntity>(query, [routeId]);
    return res.rows[0] || null;
  }

  async findRouteStops(routeId: string): Promise<RouteStopSequenceEntity[]> {
    const query = `
      SELECT 
        rs.stop_id,
        s.stop_code,
        s.name AS stop_name,
        rs.sequence_number,
        s.latitude::float,
        s.longitude::float
      FROM route_stops rs
      JOIN stops s ON rs.stop_id = s.id
      WHERE rs.route_id = $1
      ORDER BY rs.sequence_number ASC;
    `;
    const res = await this.db.query<RouteStopSequenceEntity>(query, [routeId]);
    return res.rows;
  }

  async getRouteHourlyDelay(routeId: string, timeframeDays = 30): Promise<HourlyDelayEntity[]> {
    const query = `
      SELECT 
        EXTRACT(HOUR FROM t.scheduled_departure_at)::int AS hour_of_day,
        COUNT(t.id)::int AS trips_count,
        COALESCE(ROUND(AVG(t.delay_minutes)::numeric, 1), 0.0)::float AS avg_delay_minutes,
        COALESCE(MAX(t.delay_minutes), 0)::int AS max_delay_minutes,
        COALESCE(ROUND((COUNT(t.id) FILTER (WHERE t.delay_minutes <= 5)::numeric / NULLIF(COUNT(t.id), 0)) * 100, 1), 100.0)::float AS on_time_percentage
      FROM trips t
      WHERE t.route_id = $1
        AND t.scheduled_departure_at >= CURRENT_TIMESTAMP - ($2 || ' days')::interval
      GROUP BY EXTRACT(HOUR FROM t.scheduled_departure_at)
      ORDER BY hour_of_day ASC;
    `;
    const res = await this.db.query<HourlyDelayEntity>(query, [routeId, timeframeDays]);
    return res.rows;
  }

  async getNetworkCongestionHotspots(limit = 10): Promise<CongestionHotspotEntity[]> {
    const query = `
      WITH stop_pairs AS (
        SELECT 
          t.route_id,
          r.route_code,
          ts1.stop_id AS from_stop_id,
          s1.name AS from_stop_name,
          ts2.stop_id AS to_stop_id,
          s2.name AS to_stop_name,
          ts2.delay_minutes
        FROM trip_stops ts1
        JOIN trip_stops ts2 ON ts1.trip_id = ts2.trip_id AND ts1.sequence_number + 1 = ts2.sequence_number
        JOIN trips t ON ts1.trip_id = t.id
        JOIN routes r ON t.route_id = r.id
        JOIN stops s1 ON ts1.stop_id = s1.id
        JOIN stops s2 ON ts2.stop_id = s2.id
        WHERE ts2.status IN ('ARRIVED', 'DEPARTED')
          AND t.created_at >= CURRENT_TIMESTAMP - INTERVAL '30 days'
      )
      SELECT 
        route_id,
        route_code,
        from_stop_id,
        from_stop_name,
        to_stop_id,
        to_stop_name,
        COUNT(*)::int AS sample_size,
        ROUND(AVG(delay_minutes)::numeric, 1)::float AS avg_delay_minutes,
        CASE 
          WHEN AVG(delay_minutes) >= 15 THEN 'CRITICAL'
          WHEN AVG(delay_minutes) >= 10 THEN 'HIGH'
          WHEN AVG(delay_minutes) >= 5 THEN 'MEDIUM'
          ELSE 'LOW'
        END AS congestion_level
      FROM stop_pairs
      GROUP BY route_id, route_code, from_stop_id, from_stop_name, to_stop_id, to_stop_name
      HAVING COUNT(*) >= 1
      ORDER BY avg_delay_minutes DESC, sample_size DESC
      LIMIT $1;
    `;
    const res = await this.db.query<CongestionHotspotEntity>(query, [limit]);
    return res.rows;
  }
}
