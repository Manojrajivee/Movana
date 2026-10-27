import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../database/database.service';

export interface RouteStopEntity {
  id: string;
  route_id: string;
  stop_id: string;
  sequence_number: number;
  arrival_offset_minutes: number;
  departure_offset_minutes: number;
  distance_from_origin_km: number;
  is_boarding_allowed: boolean;
  is_dropoff_allowed: boolean;
  created_at: Date;
  updated_at: Date;
  // Joined stop details
  stop_code?: string;
  stop_name?: string;
  stop_address?: string;
  stop_city?: string;
  latitude?: number;
  longitude?: number;
}

@Injectable()
export class RouteVariantsRepository {
  constructor(private readonly db: DatabaseService) {}

  async addRouteStop(
    data: {
      routeId: string;
      stopId: string;
      sequenceNumber: number;
      arrivalOffsetMinutes?: number;
      departureOffsetMinutes?: number;
      distanceFromOriginKm?: number;
      isBoardingAllowed?: boolean;
      isDropoffAllowed?: boolean;
    },
    client?: PoolClient,
  ): Promise<RouteStopEntity> {
    const query = `
      INSERT INTO route_stops (
        route_id,
        stop_id,
        sequence_number,
        arrival_offset_minutes,
        departure_offset_minutes,
        distance_from_origin_km,
        is_boarding_allowed,
        is_dropoff_allowed
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;
    const params = [
      data.routeId,
      data.stopId,
      data.sequenceNumber,
      data.arrivalOffsetMinutes ?? 0,
      data.departureOffsetMinutes ?? 0,
      data.distanceFromOriginKm ?? 0.0,
      data.isBoardingAllowed ?? true,
      data.isDropoffAllowed ?? true,
    ];

    const result = client
      ? await client.query<RouteStopEntity>(query, params)
      : await this.db.query<RouteStopEntity>(query, params);

    return result.rows[0];
  }

  async findRouteStop(
    routeId: string,
    stopId: string,
    client?: PoolClient,
  ): Promise<RouteStopEntity | null> {
    const query = `
      SELECT
        rs.*,
        s.stop_code,
        s.name AS stop_name,
        s.address AS stop_address,
        s.city AS stop_city,
        s.latitude,
        s.longitude
      FROM route_stops rs
      JOIN stops s ON s.id = rs.stop_id
      WHERE rs.route_id = $1 AND rs.stop_id = $2
    `;
    const result = client
      ? await client.query<RouteStopEntity>(query, [routeId, stopId])
      : await this.db.query<RouteStopEntity>(query, [routeId, stopId]);

    return result.rows[0] ?? null;
  }

  async findBySequence(
    routeId: string,
    sequenceNumber: number,
    client?: PoolClient,
  ): Promise<RouteStopEntity | null> {
    const query = `
      SELECT *
      FROM route_stops
      WHERE route_id = $1 AND sequence_number = $2
    `;
    const result = client
      ? await client.query<RouteStopEntity>(query, [routeId, sequenceNumber])
      : await this.db.query<RouteStopEntity>(query, [routeId, sequenceNumber]);

    return result.rows[0] ?? null;
  }

  async findStopsByRouteId(routeId: string, client?: PoolClient): Promise<RouteStopEntity[]> {
    const query = `
      SELECT
        rs.*,
        s.stop_code,
        s.name AS stop_name,
        s.address AS stop_address,
        s.city AS stop_city,
        s.latitude,
        s.longitude
      FROM route_stops rs
      JOIN stops s ON s.id = rs.stop_id
      WHERE rs.route_id = $1
      ORDER BY rs.sequence_number ASC
    `;
    const result = client
      ? await client.query<RouteStopEntity>(query, [routeId])
      : await this.db.query<RouteStopEntity>(query, [routeId]);

    return result.rows;
  }

  async updateRouteStop(
    routeId: string,
    stopId: string,
    data: {
      arrivalOffsetMinutes?: number;
      departureOffsetMinutes?: number;
      distanceFromOriginKm?: number;
      isBoardingAllowed?: boolean;
      isDropoffAllowed?: boolean;
    },
    client?: PoolClient,
  ): Promise<RouteStopEntity | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (data.arrivalOffsetMinutes !== undefined) {
      fields.push(`arrival_offset_minutes = $${idx++}`);
      values.push(data.arrivalOffsetMinutes);
    }

    if (data.departureOffsetMinutes !== undefined) {
      fields.push(`departure_offset_minutes = $${idx++}`);
      values.push(data.departureOffsetMinutes);
    }

    if (data.distanceFromOriginKm !== undefined) {
      fields.push(`distance_from_origin_km = $${idx++}`);
      values.push(data.distanceFromOriginKm);
    }

    if (data.isBoardingAllowed !== undefined) {
      fields.push(`is_boarding_allowed = $${idx++}`);
      values.push(data.isBoardingAllowed);
    }

    if (data.isDropoffAllowed !== undefined) {
      fields.push(`is_dropoff_allowed = $${idx++}`);
      values.push(data.isDropoffAllowed);
    }

    if (fields.length === 0) {
      return this.findRouteStop(routeId, stopId, client);
    }

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(routeId, stopId);

    const query = `
      UPDATE route_stops
      SET ${fields.join(', ')}
      WHERE route_id = $${idx++} AND stop_id = $${idx++}
      RETURNING *
    `;

    const result = client
      ? await client.query<RouteStopEntity>(query, values)
      : await this.db.query<RouteStopEntity>(query, values);

    return result.rows[0] ?? null;
  }

  async deleteRouteStop(
    routeId: string,
    stopId: string,
    client?: PoolClient,
  ): Promise<RouteStopEntity | null> {
    const query = `
      DELETE FROM route_stops
      WHERE route_id = $1 AND stop_id = $2
      RETURNING *
    `;
    const result = client
      ? await client.query<RouteStopEntity>(query, [routeId, stopId])
      : await this.db.query<RouteStopEntity>(query, [routeId, stopId]);

    return result.rows[0] ?? null;
  }

  async updateStopSequence(
    routeId: string,
    stopId: string,
    sequenceNumber: number,
    client: PoolClient,
  ): Promise<void> {
    const query = `
      UPDATE route_stops
      SET sequence_number = $3, updated_at = CURRENT_TIMESTAMP
      WHERE route_id = $1 AND stop_id = $2
    `;
    await client.query(query, [routeId, stopId, sequenceNumber]);
  }

  async checkRouteExists(routeId: string): Promise<boolean> {
    const query = `
      SELECT id FROM routes WHERE id = $1 AND deleted_at IS NULL
    `;
    const result = await this.db.query(query, [routeId]);
    return (result.rowCount ?? 0) > 0;
  }

  async checkStopExists(stopId: string): Promise<boolean> {
    const query = `
      SELECT id FROM stops WHERE id = $1
    `;
    const result = await this.db.query(query, [stopId]);
    return (result.rowCount ?? 0) > 0;
  }
}
