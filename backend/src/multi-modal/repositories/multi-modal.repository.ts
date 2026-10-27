import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

export interface MultiModalHubEntity {
  hub_stop_id: string;
  hub_stop_code: string;
  hub_stop_name: string;
  city: string;
  latitude: number;
  longitude: number;
  connected_routes_count: number;
  connected_routes: string[];
}

export interface HubRouteConnectionEntity {
  route_id: string;
  route_code: string;
  route_name: string;
  sequence_number: number;
  origin_stop_name: string;
  destination_stop_name: string;
  vehicle_type_name: string | null;
}

@Injectable()
export class MultiModalRepository {
  constructor(private readonly db: DatabaseService) {}

  async findStopById(id: string): Promise<any | null> {
    const query = `
      SELECT id, stop_code, name, city, latitude::float, longitude::float, status
      FROM stops
      WHERE id = $1;
    `;
    const res = await this.db.query(query, [id]);
    return res.rows[0] || null;
  }

  async findInterchangeHubs(limit = 20): Promise<MultiModalHubEntity[]> {
    const query = `
      SELECT 
        s.id AS hub_stop_id,
        s.stop_code AS hub_stop_code,
        s.name AS hub_stop_name,
        s.city,
        s.latitude::float,
        s.longitude::float,
        COUNT(DISTINCT rs.route_id)::int AS connected_routes_count,
        ARRAY_AGG(DISTINCT r.route_code) AS connected_routes
      FROM stops s
      JOIN route_stops rs ON s.id = rs.stop_id
      JOIN routes r ON rs.route_id = r.id AND r.status = 'ACTIVE' AND r.deleted_at IS NULL
      WHERE s.status = 'ACTIVE'
      GROUP BY s.id, s.stop_code, s.name, s.city, s.latitude, s.longitude
      HAVING COUNT(DISTINCT rs.route_id) >= 2
      ORDER BY connected_routes_count DESC, s.name ASC
      LIMIT $1;
    `;
    const res = await this.db.query<MultiModalHubEntity>(query, [limit]);
    return res.rows;
  }

  async findHubConnections(stopId: string): Promise<HubRouteConnectionEntity[]> {
    const query = `
      SELECT 
        r.id AS route_id,
        r.route_code,
        r.name AS route_name,
        rs.sequence_number,
        s_orig.name AS origin_stop_name,
        s_dest.name AS destination_stop_name,
        (SELECT vt.name FROM vehicles v JOIN vehicle_types vt ON v.vehicle_type_id = vt.id WHERE v.id = (SELECT vehicle_id FROM trips t WHERE t.route_id = r.id AND t.status IN ('SCHEDULED', 'IN_TRANSIT') LIMIT 1)) AS vehicle_type_name
      FROM route_stops rs
      JOIN routes r ON rs.route_id = r.id
      JOIN stops s_orig ON r.origin_stop_id = s_orig.id
      JOIN stops s_dest ON r.destination_stop_id = s_dest.id
      WHERE rs.stop_id = $1
        AND r.status = 'ACTIVE'
        AND r.deleted_at IS NULL
      ORDER BY r.route_code ASC;
    `;
    const res = await this.db.query<HubRouteConnectionEntity>(query, [stopId]);
    return res.rows;
  }

  async findDirectRouteOption(originStopId: string, destStopId: string): Promise<any | null> {
    const query = `
      SELECT 
        r.id AS route_id,
        r.route_code,
        r.name AS route_name,
        rs1.sequence_number AS orig_seq,
        rs2.sequence_number AS dest_seq,
        (rs2.sequence_number - rs1.sequence_number) AS stops_count,
        ROUND((r.distance_km * ((rs2.sequence_number - rs1.sequence_number)::numeric / NULLIF((SELECT MAX(sequence_number) FROM route_stops WHERE route_id = r.id), 0)))::numeric, 2)::float AS distance_km,
        ROUND((r.estimated_duration_minutes * ((rs2.sequence_number - rs1.sequence_number)::numeric / NULLIF((SELECT MAX(sequence_number) FROM route_stops WHERE route_id = r.id), 0)))::numeric, 0)::int AS duration_minutes
      FROM route_stops rs1
      JOIN route_stops rs2 ON rs1.route_id = rs2.route_id
      JOIN routes r ON rs1.route_id = r.id
      WHERE rs1.stop_id = $1
        AND rs2.stop_id = $2
        AND rs1.sequence_number < rs2.sequence_number
        AND r.status = 'ACTIVE'
        AND r.deleted_at IS NULL
      ORDER BY stops_count ASC
      LIMIT 1;
    `;
    const res = await this.db.query(query, [originStopId, destStopId]);
    return res.rows[0] || null;
  }

  async findConnectingHub(originStopId: string, destStopId: string): Promise<any | null> {
    const query = `
      SELECT 
        s_hub.id AS hub_id,
        s_hub.name AS hub_name,
        s_hub.stop_code AS hub_code,
        s_hub.latitude::float AS hub_lat,
        s_hub.longitude::float AS hub_lon,
        r1.id AS leg1_route_id,
        r1.route_code AS leg1_route_code,
        r1.name AS leg1_route_name,
        (rs1_hub.sequence_number - rs1_orig.sequence_number) AS leg1_stops,
        r2.id AS leg2_route_id,
        r2.route_code AS leg2_route_code,
        r2.name AS leg2_route_name,
        (rs2_dest.sequence_number - rs2_hub.sequence_number) AS leg2_stops
      FROM route_stops rs1_orig
      JOIN route_stops rs1_hub ON rs1_orig.route_id = rs1_hub.route_id
      JOIN routes r1 ON rs1_orig.route_id = r1.id
      JOIN stops s_hub ON rs1_hub.stop_id = s_hub.id
      JOIN route_stops rs2_hub ON rs2_hub.stop_id = s_hub.id
      JOIN route_stops rs2_dest ON rs2_hub.route_id = rs2_dest.route_id
      JOIN routes r2 ON rs2_hub.route_id = r2.id
      WHERE rs1_orig.stop_id = $1
        AND rs2_dest.stop_id = $2
        AND rs1_orig.sequence_number < rs1_hub.sequence_number
        AND rs2_hub.sequence_number < rs2_dest.sequence_number
        AND r1.id <> r2.id
        AND r1.status = 'ACTIVE' AND r1.deleted_at IS NULL
        AND r2.status = 'ACTIVE' AND r2.deleted_at IS NULL
        AND s_hub.status = 'ACTIVE'
      ORDER BY (rs1_hub.sequence_number - rs1_orig.sequence_number + rs2_dest.sequence_number - rs2_hub.sequence_number) ASC
      LIMIT 1;
    `;
    const res = await this.db.query(query, [originStopId, destStopId]);
    return res.rows[0] || null;
  }
}
