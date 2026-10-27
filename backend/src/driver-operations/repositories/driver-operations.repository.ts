import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../database/database.service';

export interface DriverDutyAssignmentEntity {
  id: string;
  driver_id: string;
  vehicle_id: string | null;
  trip_id: string | null;
  assignment_type: string;
  start_at: Date;
  end_at: Date | null;
  status: 'SCHEDULED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  assigned_by: string;
  created_at: Date;
  updated_at: Date;
  vehicle_registration_number?: string;
  vehicle_code?: string;
  driver_employee_code?: string;
  driver_license_number?: string;
}

export interface DriverSafetyEventEntity {
  id: string;
  driver_id: string;
  vehicle_id: string;
  trip_id: string | null;
  event_type: string;
  severity: string;
  speed_kmh: number | null;
  latitude: number | null;
  longitude: number | null;
  event_data: Record<string, any>;
  occurred_at: Date;
  created_at: Date;
  driver_employee_code?: string;
  vehicle_registration_number?: string;
}

export interface DriverHoursSummary {
  driver_id: string;
  hours_last_24h: number;
  hours_last_7d: number;
  total_completed_shifts: number;
}

@Injectable()
export class DriverOperationsRepository {
  constructor(private readonly db: DatabaseService) {}

  async findActiveDutyAssignment(
    driverId: string,
    client?: PoolClient,
  ): Promise<DriverDutyAssignmentEntity | null> {
    const query = `
      SELECT 
        da.*,
        v.registration_number AS vehicle_registration_number,
        v.vehicle_code AS vehicle_code,
        d.employee_code AS driver_employee_code,
        d.license_number AS driver_license_number
      FROM driver_assignments da
      JOIN drivers d ON d.id = da.driver_id
      LEFT JOIN vehicles v ON v.id = da.vehicle_id
      WHERE da.driver_id = $1 AND da.status = 'ACTIVE'
      ORDER BY da.start_at DESC
      LIMIT 1
    `;
    const result = client
      ? await client.query<DriverDutyAssignmentEntity>(query, [driverId])
      : await this.db.query<DriverDutyAssignmentEntity>(query, [driverId]);

    return result.rows[0] ?? null;
  }

  async findAssignmentById(
    id: string,
    client?: PoolClient,
  ): Promise<DriverDutyAssignmentEntity | null> {
    const query = `
      SELECT 
        da.*,
        v.registration_number AS vehicle_registration_number,
        v.vehicle_code AS vehicle_code,
        d.employee_code AS driver_employee_code,
        d.license_number AS driver_license_number
      FROM driver_assignments da
      JOIN drivers d ON d.id = da.driver_id
      LEFT JOIN vehicles v ON v.id = da.vehicle_id
      WHERE da.id = $1
    `;
    const result = client
      ? await client.query<DriverDutyAssignmentEntity>(query, [id])
      : await this.db.query<DriverDutyAssignmentEntity>(query, [id]);

    return result.rows[0] ?? null;
  }

  async updateDutyStatus(
    id: string,
    status: 'ACTIVE' | 'COMPLETED',
    endAt?: Date,
    client?: PoolClient,
  ): Promise<DriverDutyAssignmentEntity | null> {
    let query: string;
    let params: (string | Date)[];

    if (endAt) {
      query = `
        UPDATE driver_assignments
        SET status = $1, end_at = $2, updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
        RETURNING *
      `;
      params = [status, endAt, id];
    } else {
      query = `
        UPDATE driver_assignments
        SET status = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING *
      `;
      params = [status, id];
    }

    const result = client
      ? await client.query<DriverDutyAssignmentEntity>(query, params)
      : await this.db.query<DriverDutyAssignmentEntity>(query, params);

    return result.rows[0] ?? null;
  }

  async findDutyHistory(
    driverId: string,
    options: { from?: string; to?: string; limit: number; offset: number },
    client?: PoolClient,
  ): Promise<{ history: DriverDutyAssignmentEntity[]; total: number }> {
    const conditions = ['da.driver_id = $1'];
    const params: (string | number)[] = [driverId];
    let paramIndex = 2;

    if (options.from) {
      conditions.push(`da.start_at >= $${paramIndex++}`);
      params.push(options.from);
    }

    if (options.to) {
      conditions.push(`da.start_at <= $${paramIndex++}`);
      params.push(options.to);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const countQuery = `
      SELECT COUNT(*)::int AS count
      FROM driver_assignments da
      ${whereClause}
    `;
    const countResult = client
      ? await client.query<{ count: number }>(countQuery, params)
      : await this.db.query<{ count: number }>(countQuery, params);
    const total = countResult.rows[0]?.count ?? 0;

    const dataQuery = `
      SELECT 
        da.*,
        v.registration_number AS vehicle_registration_number,
        v.vehicle_code AS vehicle_code,
        d.employee_code AS driver_employee_code,
        d.license_number AS driver_license_number
      FROM driver_assignments da
      JOIN drivers d ON d.id = da.driver_id
      LEFT JOIN vehicles v ON v.id = da.vehicle_id
      ${whereClause}
      ORDER BY da.start_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;
    params.push(options.limit, options.offset);

    const dataResult = client
      ? await client.query<DriverDutyAssignmentEntity>(dataQuery, params)
      : await this.db.query<DriverDutyAssignmentEntity>(dataQuery, params);

    return { history: dataResult.rows, total };
  }

  async getDriverHoursSummary(driverId: string, client?: PoolClient): Promise<DriverHoursSummary> {
    const query = `
      SELECT 
        $1::uuid AS driver_id,
        COALESCE(
          ROUND(
            SUM(
              EXTRACT(EPOCH FROM (COALESCE(end_at, CURRENT_TIMESTAMP) - start_at)) / 3600.0
            ) FILTER (WHERE start_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours'),
            2
          ),
          0.00
        )::float AS hours_last_24h,
        COALESCE(
          ROUND(
            SUM(
              EXTRACT(EPOCH FROM (COALESCE(end_at, CURRENT_TIMESTAMP) - start_at)) / 3600.0
            ) FILTER (WHERE start_at >= CURRENT_TIMESTAMP - INTERVAL '7 days'),
            2
          ),
          0.00
        )::float AS hours_last_7d,
        COUNT(*) FILTER (WHERE status = 'COMPLETED')::int AS total_completed_shifts
      FROM driver_assignments
      WHERE driver_id = $1 AND status IN ('ACTIVE', 'COMPLETED')
    `;
    const result = client
      ? await client.query<DriverHoursSummary>(query, [driverId])
      : await this.db.query<DriverHoursSummary>(query, [driverId]);

    return (
      result.rows[0] ?? {
        driver_id: driverId,
        hours_last_24h: 0,
        hours_last_7d: 0,
        total_completed_shifts: 0,
      }
    );
  }

  async createSafetyEvent(
    data: {
      driverId: string;
      vehicleId: string;
      tripId?: string | null;
      eventType: string;
      severity: string;
      speedKmh?: number | null;
      latitude?: number | null;
      longitude?: number | null;
      eventData?: Record<string, any>;
      occurredAt: string;
    },
    client?: PoolClient,
  ): Promise<DriverSafetyEventEntity> {
    const query = `
      INSERT INTO driver_safety_events (
        driver_id, vehicle_id, trip_id, event_type, severity,
        speed_kmh, latitude, longitude, event_data, occurred_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;
    const params = [
      data.driverId,
      data.vehicleId,
      data.tripId ?? null,
      data.eventType,
      data.severity,
      data.speedKmh ?? null,
      data.latitude ?? null,
      data.longitude ?? null,
      JSON.stringify(data.eventData ?? {}),
      data.occurredAt,
    ];

    const result = client
      ? await client.query<DriverSafetyEventEntity>(query, params)
      : await this.db.query<DriverSafetyEventEntity>(query, params);

    return result.rows[0];
  }

  async findSafetyEvents(
    options: {
      driverId?: string;
      vehicleId?: string;
      eventType?: string;
      severity?: string;
      from?: string;
      to?: string;
      limit: number;
      offset: number;
    },
    client?: PoolClient,
  ): Promise<{ events: DriverSafetyEventEntity[]; total: number }> {
    const conditions: string[] = [];
    const params: (string | number)[] = [];
    let paramIndex = 1;

    if (options.driverId) {
      conditions.push(`dse.driver_id = $${paramIndex++}`);
      params.push(options.driverId);
    }

    if (options.vehicleId) {
      conditions.push(`dse.vehicle_id = $${paramIndex++}`);
      params.push(options.vehicleId);
    }

    if (options.eventType) {
      conditions.push(`dse.event_type = $${paramIndex++}`);
      params.push(options.eventType);
    }

    if (options.severity) {
      conditions.push(`dse.severity = $${paramIndex++}`);
      params.push(options.severity);
    }

    if (options.from) {
      conditions.push(`dse.occurred_at >= $${paramIndex++}`);
      params.push(options.from);
    }

    if (options.to) {
      conditions.push(`dse.occurred_at <= $${paramIndex++}`);
      params.push(options.to);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countQuery = `
      SELECT COUNT(*)::int AS count
      FROM driver_safety_events dse
      ${whereClause}
    `;
    const countResult = client
      ? await client.query<{ count: number }>(countQuery, params)
      : await this.db.query<{ count: number }>(countQuery, params);
    const total = countResult.rows[0]?.count ?? 0;

    const dataQuery = `
      SELECT 
        dse.*,
        d.employee_code AS driver_employee_code,
        v.registration_number AS vehicle_registration_number
      FROM driver_safety_events dse
      JOIN drivers d ON d.id = dse.driver_id
      JOIN vehicles v ON v.id = dse.vehicle_id
      ${whereClause}
      ORDER BY dse.occurred_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;
    params.push(options.limit, options.offset);

    const dataResult = client
      ? await client.query<DriverSafetyEventEntity>(dataQuery, params)
      : await this.db.query<DriverSafetyEventEntity>(dataQuery, params);

    return { events: dataResult.rows, total };
  }
}
