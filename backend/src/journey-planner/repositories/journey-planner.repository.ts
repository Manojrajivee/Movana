import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

export interface StopCoordinateEntity {
  id: string;
  stop_code: string;
  name: string;
  city: string;
  latitude: number;
  longitude: number;
  distance_meters?: number;
}

export interface DirectRouteConnection {
  route_id: string;
  route_code: string;
  route_name: string;
  origin_sequence: number;
  destination_sequence: number;
  intermediate_stops_count: number;
  estimated_duration_minutes: number;
  distance_km: number;
}

export interface TransferRouteConnection {
  leg1_route_id: string;
  leg1_route_code: string;
  leg1_route_name: string;
  leg1_origin_seq: number;
  leg1_dest_seq: number;
  transfer_stop_id: string;
  transfer_stop_name: string;
  transfer_stop_code: string;
  transfer_latitude: number;
  transfer_longitude: number;
  leg2_route_id: string;
  leg2_route_code: string;
  leg2_route_name: string;
  leg2_origin_seq: number;
  leg2_dest_seq: number;
}

@Injectable()
export class JourneyPlannerRepository {
  constructor(private readonly db: DatabaseService) {}

  async findStopById(id: string): Promise<StopCoordinateEntity | null> {
    const query = `
      SELECT id, stop_code, name, city, latitude::float, longitude::float
      FROM stops
      WHERE id = $1 AND status = 'ACTIVE';
    `;
    const res = await this.db.query<StopCoordinateEntity>(query, [id]);
    return res.rows[0] || null;
  }

  async findNearestStop(lat: number, lon: number): Promise<StopCoordinateEntity | null> {
    const query = `
      SELECT 
        id, stop_code, name, city, latitude::float, longitude::float,
        ROUND((
          6371000 * acos(
            least(1.0, greatest(-1.0, 
              cos(radians($1)) * cos(radians(latitude)) * cos(radians(longitude) - radians($2)) + 
              sin(radians($1)) * sin(radians(latitude))
            ))
          )
        )::numeric, 1)::float AS distance_meters
      FROM stops
      WHERE status = 'ACTIVE'
      ORDER BY distance_meters ASC
      LIMIT 1;
    `;
    const res = await this.db.query<StopCoordinateEntity>(query, [lat, lon]);
    return res.rows[0] || null;
  }

  async findDirectRoutes(
    originStopId: string,
    destStopId: string,
  ): Promise<DirectRouteConnection[]> {
    const query = `
      SELECT 
        r.id AS route_id,
        r.route_code,
        r.name AS route_name,
        rs1.sequence_number AS origin_sequence,
        rs2.sequence_number AS destination_sequence,
        (rs2.sequence_number - rs1.sequence_number) AS intermediate_stops_count,
        ROUND((r.estimated_duration_minutes * ((rs2.sequence_number - rs1.sequence_number)::numeric / NULLIF((SELECT MAX(sequence_number) FROM route_stops WHERE route_id = r.id), 0)))::numeric, 0)::int AS estimated_duration_minutes,
        ROUND((r.distance_km * ((rs2.sequence_number - rs1.sequence_number)::numeric / NULLIF((SELECT MAX(sequence_number) FROM route_stops WHERE route_id = r.id), 0)))::numeric, 2)::float AS distance_km
      FROM route_stops rs1
      JOIN route_stops rs2 ON rs1.route_id = rs2.route_id
      JOIN routes r ON rs1.route_id = r.id
      WHERE rs1.stop_id = $1
        AND rs2.stop_id = $2
        AND rs1.sequence_number < rs2.sequence_number
        AND r.status = 'ACTIVE'
        AND r.deleted_at IS NULL
      ORDER BY intermediate_stops_count ASC, r.route_code ASC;
    `;
    const res = await this.db.query<DirectRouteConnection>(query, [originStopId, destStopId]);
    return res.rows;
  }

  async findTransferRoutes(
    originStopId: string,
    destStopId: string,
    limit = 10,
  ): Promise<TransferRouteConnection[]> {
    const query = `
      SELECT 
        r1.id AS leg1_route_id,
        r1.route_code AS leg1_route_code,
        r1.name AS leg1_route_name,
        rs1_orig.sequence_number AS leg1_origin_seq,
        rs1_xfer.sequence_number AS leg1_dest_seq,
        s_xfer.id AS transfer_stop_id,
        s_xfer.name AS transfer_stop_name,
        s_xfer.stop_code AS transfer_stop_code,
        s_xfer.latitude::float AS transfer_latitude,
        s_xfer.longitude::float AS transfer_longitude,
        r2.id AS leg2_route_id,
        r2.route_code AS leg2_route_code,
        r2.name AS leg2_route_name,
        rs2_xfer.sequence_number AS leg2_origin_seq,
        rs2_dest.sequence_number AS leg2_dest_seq
      FROM route_stops rs1_orig
      JOIN route_stops rs1_xfer ON rs1_orig.route_id = rs1_xfer.route_id
      JOIN routes r1 ON rs1_orig.route_id = r1.id
      JOIN stops s_xfer ON rs1_xfer.stop_id = s_xfer.id
      JOIN route_stops rs2_xfer ON rs2_xfer.stop_id = s_xfer.id
      JOIN route_stops rs2_dest ON rs2_xfer.route_id = rs2_dest.route_id
      JOIN routes r2 ON rs2_xfer.route_id = r2.id
      WHERE rs1_orig.stop_id = $1
        AND rs2_dest.stop_id = $2
        AND rs1_orig.sequence_number < rs1_xfer.sequence_number
        AND rs2_xfer.sequence_number < rs2_dest.sequence_number
        AND r1.id <> r2.id
        AND r1.status = 'ACTIVE' AND r1.deleted_at IS NULL
        AND r2.status = 'ACTIVE' AND r2.deleted_at IS NULL
        AND s_xfer.status = 'ACTIVE'
      ORDER BY (rs1_xfer.sequence_number - rs1_orig.sequence_number + rs2_dest.sequence_number - rs2_xfer.sequence_number) ASC
      LIMIT $3;
    `;
    const res = await this.db.query<TransferRouteConnection>(query, [
      originStopId,
      destStopId,
      limit,
    ]);
    return res.rows;
  }

  async findUpcomingTripsForRoute(routeId: string, limit = 5): Promise<any[]> {
    const query = `
      SELECT 
        t.id AS trip_id,
        t.trip_number,
        t.status,
        t.scheduled_departure_at,
        t.scheduled_arrival_at,
        t.delay_minutes,
        v.vehicle_code,
        vt.name AS vehicle_type
      FROM trips t
      LEFT JOIN vehicles v ON t.vehicle_id = v.id
      LEFT JOIN vehicle_types vt ON v.vehicle_type_id = vt.id
      WHERE t.route_id = $1
        AND t.status IN ('SCHEDULED', 'BOARDING', 'IN_TRANSIT')
        AND t.scheduled_departure_at >= CURRENT_TIMESTAMP - INTERVAL '1 hour'
      ORDER BY t.scheduled_departure_at ASC
      LIMIT $2;
    `;
    const res = await this.db.query(query, [routeId, limit]);
    return res.rows;
  }
}
