import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../database/database.service';

export interface DriverAssignmentEntity {
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
}

export interface DriverAvailabilityEntity {
  id: string;
  driver_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_available: boolean;
  effective_date: string;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class DriverAssignmentsRepository {
  constructor(private readonly db: DatabaseService) {}

  async createAssignment(
    data: {
      driverId: string;
      vehicleId?: string | null;
      tripId?: string | null;
      assignmentType: string;
      startAt: string;
      endAt?: string | null;
      assignedBy: string;
    },
    client?: PoolClient,
  ): Promise<DriverAssignmentEntity> {
    const query = `
      INSERT INTO driver_assignments (
        driver_id, vehicle_id, trip_id, assignment_type, start_at, end_at, status, assigned_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'SCHEDULED', $7)
      RETURNING *
    `;
    const params = [
      data.driverId,
      data.vehicleId ?? null,
      data.tripId ?? null,
      data.assignmentType,
      data.startAt,
      data.endAt ?? null,
      data.assignedBy,
    ];

    const result = client
      ? await client.query<DriverAssignmentEntity>(query, params)
      : await this.db.query<DriverAssignmentEntity>(query, params);

    return result.rows[0];
  }

  async findAssignmentById(
    id: string,
    client?: PoolClient,
  ): Promise<DriverAssignmentEntity | null> {
    const query = `
      SELECT 
        da.*,
        d.employee_code,
        d.license_number,
        u.first_name AS driver_first_name,
        u.last_name AS driver_last_name,
        v.registration_number AS vehicle_registration_number,
        v.vehicle_code AS vehicle_code
      FROM driver_assignments da
      JOIN drivers d ON d.id = da.driver_id
      JOIN users u ON u.id = d.user_id
      LEFT JOIN vehicles v ON v.id = da.vehicle_id
      WHERE da.id = $1
    `;
    const result = client
      ? await client.query<DriverAssignmentEntity>(query, [id])
      : await this.db.query<DriverAssignmentEntity>(query, [id]);

    return result.rows[0] ?? null;
  }

  async findConflictingDriverAssignment(
    driverId: string,
    startAt: string,
    endAt: string | null,
    excludeAssignmentId?: string,
    client?: PoolClient,
  ): Promise<DriverAssignmentEntity | null> {
    const query = `
      SELECT *
      FROM driver_assignments
      WHERE driver_id = $1
        AND status IN ('SCHEDULED', 'ACTIVE')
        AND ($2::timestamptz < COALESCE(end_at, '9999-12-31'::timestamptz))
        AND (COALESCE($3::timestamptz, '9999-12-31'::timestamptz) > start_at)
        AND ($4::uuid IS NULL OR id <> $4::uuid)
      LIMIT 1
    `;
    const params = [driverId, startAt, endAt, excludeAssignmentId ?? null];
    const result = client
      ? await client.query<DriverAssignmentEntity>(query, params)
      : await this.db.query<DriverAssignmentEntity>(query, params);

    return result.rows[0] ?? null;
  }

  async findConflictingVehicleAssignment(
    vehicleId: string,
    startAt: string,
    endAt: string | null,
    excludeAssignmentId?: string,
    client?: PoolClient,
  ): Promise<DriverAssignmentEntity | null> {
    const query = `
      SELECT *
      FROM driver_assignments
      WHERE vehicle_id = $1
        AND status IN ('SCHEDULED', 'ACTIVE')
        AND ($2::timestamptz < COALESCE(end_at, '9999-12-31'::timestamptz))
        AND (COALESCE($3::timestamptz, '9999-12-31'::timestamptz) > start_at)
        AND ($4::uuid IS NULL OR id <> $4::uuid)
      LIMIT 1
    `;
    const params = [vehicleId, startAt, endAt, excludeAssignmentId ?? null];
    const result = client
      ? await client.query<DriverAssignmentEntity>(query, params)
      : await this.db.query<DriverAssignmentEntity>(query, params);

    return result.rows[0] ?? null;
  }

  async findAssignments(
    options: {
      driverId?: string;
      vehicleId?: string;
      status?: string;
      from?: string;
      to?: string;
      limit: number;
      offset: number;
    },
    client?: PoolClient,
  ): Promise<{ assignments: DriverAssignmentEntity[]; total: number }> {
    const conditions: string[] = [];
    const params: (string | number)[] = [];
    let paramIndex = 1;

    if (options.driverId) {
      conditions.push(`da.driver_id = $${paramIndex++}`);
      params.push(options.driverId);
    }

    if (options.vehicleId) {
      conditions.push(`da.vehicle_id = $${paramIndex++}`);
      params.push(options.vehicleId);
    }

    if (options.status) {
      conditions.push(`da.status = $${paramIndex++}`);
      params.push(options.status);
    }

    if (options.from) {
      conditions.push(`da.start_at >= $${paramIndex++}`);
      params.push(options.from);
    }

    if (options.to) {
      conditions.push(`da.start_at <= $${paramIndex++}`);
      params.push(options.to);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

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
        d.employee_code,
        d.license_number,
        u.first_name AS driver_first_name,
        u.last_name AS driver_last_name,
        v.registration_number AS vehicle_registration_number,
        v.vehicle_code AS vehicle_code
      FROM driver_assignments da
      JOIN drivers d ON d.id = da.driver_id
      JOIN users u ON u.id = d.user_id
      LEFT JOIN vehicles v ON v.id = da.vehicle_id
      ${whereClause}
      ORDER BY da.start_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;
    params.push(options.limit, options.offset);

    const dataResult = client
      ? await client.query<DriverAssignmentEntity>(dataQuery, params)
      : await this.db.query<DriverAssignmentEntity>(dataQuery, params);

    return { assignments: dataResult.rows, total };
  }

  async updateAssignmentStatus(
    id: string,
    status: 'SCHEDULED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED',
    client?: PoolClient,
  ): Promise<DriverAssignmentEntity | null> {
    const query = `
      UPDATE driver_assignments
      SET status = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `;
    const result = client
      ? await client.query<DriverAssignmentEntity>(query, [status, id])
      : await this.db.query<DriverAssignmentEntity>(query, [status, id]);

    return result.rows[0] ?? null;
  }

  async createAvailability(
    driverId: string,
    data: {
      dayOfWeek: number;
      startTime: string;
      endTime: string;
      isAvailable: boolean;
      effectiveDate?: string;
    },
    client?: PoolClient,
  ): Promise<DriverAvailabilityEntity> {
    const query = `
      INSERT INTO driver_availability (
        driver_id, day_of_week, start_time, end_time, is_available, effective_date
      )
      VALUES ($1, $2, $3, $4, $5, COALESCE($6, CURRENT_DATE))
      RETURNING *
    `;
    const params = [
      driverId,
      data.dayOfWeek,
      data.startTime,
      data.endTime,
      data.isAvailable,
      data.effectiveDate ?? null,
    ];

    const result = client
      ? await client.query<DriverAvailabilityEntity>(query, params)
      : await this.db.query<DriverAvailabilityEntity>(query, params);

    return result.rows[0];
  }

  async findAvailabilityByDriver(
    driverId: string,
    client?: PoolClient,
  ): Promise<DriverAvailabilityEntity[]> {
    const query = `
      SELECT *
      FROM driver_availability
      WHERE driver_id = $1
      ORDER BY day_of_week ASC, start_time ASC
    `;
    const result = client
      ? await client.query<DriverAvailabilityEntity>(query, [driverId])
      : await this.db.query<DriverAvailabilityEntity>(query, [driverId]);

    return result.rows;
  }

  async deleteAvailability(
    id: string,
    driverId: string,
    client?: PoolClient,
  ): Promise<DriverAvailabilityEntity | null> {
    const query = `
      DELETE FROM driver_availability
      WHERE id = $1 AND driver_id = $2
      RETURNING *
    `;
    const result = client
      ? await client.query<DriverAvailabilityEntity>(query, [id, driverId])
      : await this.db.query<DriverAvailabilityEntity>(query, [id, driverId]);

    return result.rows[0] ?? null;
  }
}
