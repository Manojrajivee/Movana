import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../database/database.service';

export interface VehicleAssignmentEntity {
  id: string;
  vehicle_id: string;
  driver_id: string;
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
  driver_first_name?: string;
  driver_last_name?: string;
}

export interface VehicleStatusHistoryEntity {
  id: string;
  vehicle_id: string;
  old_status: string;
  new_status: string;
  reason: string | null;
  changed_by: string | null;
  created_at: Date;
  changed_by_name?: string;
}

export interface FleetSummaryStats {
  total_vehicles: number;
  active_vehicles: number;
  maintenance_vehicles: number;
  reserved_vehicles: number;
  decommissioned_vehicles: number;
  active_assignments: number;
}

@Injectable()
export class FleetOperationsRepository {
  constructor(private readonly db: DatabaseService) {}

  async createVehicleAssignment(
    data: {
      vehicleId: string;
      driverId: string;
      tripId?: string | null;
      assignmentType: string;
      startAt: string;
      endAt?: string | null;
      assignedBy: string;
    },
    client?: PoolClient,
  ): Promise<VehicleAssignmentEntity> {
    const query = `
      INSERT INTO vehicle_assignments (
        vehicle_id, driver_id, trip_id, assignment_type, start_at, end_at, status, assigned_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'SCHEDULED', $7)
      RETURNING *
    `;
    const params = [
      data.vehicleId,
      data.driverId,
      data.tripId ?? null,
      data.assignmentType,
      data.startAt,
      data.endAt ?? null,
      data.assignedBy,
    ];

    const result = client
      ? await client.query<VehicleAssignmentEntity>(query, params)
      : await this.db.query<VehicleAssignmentEntity>(query, params);

    return result.rows[0];
  }

  async findConflictingVehicleAssignment(
    vehicleId: string,
    startAt: string,
    endAt: string | null,
    excludeAssignmentId?: string,
    client?: PoolClient,
  ): Promise<VehicleAssignmentEntity | null> {
    const query = `
      SELECT *
      FROM vehicle_assignments
      WHERE vehicle_id = $1
        AND status IN ('SCHEDULED', 'ACTIVE')
        AND ($2::timestamptz < COALESCE(end_at, '9999-12-31'::timestamptz))
        AND (COALESCE($3::timestamptz, '9999-12-31'::timestamptz) > start_at)
        AND ($4::uuid IS NULL OR id <> $4::uuid)
      LIMIT 1
    `;
    const params = [vehicleId, startAt, endAt, excludeAssignmentId ?? null];
    const result = client
      ? await client.query<VehicleAssignmentEntity>(query, params)
      : await this.db.query<VehicleAssignmentEntity>(query, params);

    return result.rows[0] ?? null;
  }

  async findAssignmentById(
    id: string,
    client?: PoolClient,
  ): Promise<VehicleAssignmentEntity | null> {
    const query = `
      SELECT 
        va.*,
        v.registration_number AS vehicle_registration_number,
        v.vehicle_code AS vehicle_code,
        d.employee_code AS driver_employee_code,
        d.license_number AS driver_license_number,
        u.first_name AS driver_first_name,
        u.last_name AS driver_last_name
      FROM vehicle_assignments va
      JOIN vehicles v ON v.id = va.vehicle_id
      JOIN drivers d ON d.id = va.driver_id
      JOIN users u ON u.id = d.user_id
      WHERE va.id = $1
    `;
    const result = client
      ? await client.query<VehicleAssignmentEntity>(query, [id])
      : await this.db.query<VehicleAssignmentEntity>(query, [id]);

    return result.rows[0] ?? null;
  }

  async findAssignments(
    options: {
      vehicleId?: string;
      driverId?: string;
      status?: string;
      from?: string;
      to?: string;
      limit: number;
      offset: number;
    },
    client?: PoolClient,
  ): Promise<{ assignments: VehicleAssignmentEntity[]; total: number }> {
    const conditions: string[] = [];
    const params: (string | number)[] = [];
    let paramIndex = 1;

    if (options.vehicleId) {
      conditions.push(`va.vehicle_id = $${paramIndex++}`);
      params.push(options.vehicleId);
    }

    if (options.driverId) {
      conditions.push(`va.driver_id = $${paramIndex++}`);
      params.push(options.driverId);
    }

    if (options.status) {
      conditions.push(`va.status = $${paramIndex++}`);
      params.push(options.status);
    }

    if (options.from) {
      conditions.push(`va.start_at >= $${paramIndex++}`);
      params.push(options.from);
    }

    if (options.to) {
      conditions.push(`va.start_at <= $${paramIndex++}`);
      params.push(options.to);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countQuery = `
      SELECT COUNT(*)::int AS count
      FROM vehicle_assignments va
      ${whereClause}
    `;
    const countResult = client
      ? await client.query<{ count: number }>(countQuery, params)
      : await this.db.query<{ count: number }>(countQuery, params);
    const total = countResult.rows[0]?.count ?? 0;

    const dataQuery = `
      SELECT 
        va.*,
        v.registration_number AS vehicle_registration_number,
        v.vehicle_code AS vehicle_code,
        d.employee_code AS driver_employee_code,
        d.license_number AS driver_license_number,
        u.first_name AS driver_first_name,
        u.last_name AS driver_last_name
      FROM vehicle_assignments va
      JOIN vehicles v ON v.id = va.vehicle_id
      JOIN drivers d ON d.id = va.driver_id
      JOIN users u ON u.id = d.user_id
      ${whereClause}
      ORDER BY va.start_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;
    params.push(options.limit, options.offset);

    const dataResult = client
      ? await client.query<VehicleAssignmentEntity>(dataQuery, params)
      : await this.db.query<VehicleAssignmentEntity>(dataQuery, params);

    return { assignments: dataResult.rows, total };
  }

  async updateAssignmentStatus(
    id: string,
    status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED',
    client?: PoolClient,
  ): Promise<VehicleAssignmentEntity | null> {
    const query = `
      UPDATE vehicle_assignments
      SET status = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `;
    const result = client
      ? await client.query<VehicleAssignmentEntity>(query, [status, id])
      : await this.db.query<VehicleAssignmentEntity>(query, [status, id]);

    return result.rows[0] ?? null;
  }

  async findVehicleStatusHistory(
    vehicleId: string,
    limit: number = 20,
    offset: number = 0,
    client?: PoolClient,
  ): Promise<{ history: VehicleStatusHistoryEntity[]; total: number }> {
    const countQuery = `
      SELECT COUNT(*)::int AS count
      FROM vehicle_status_history
      WHERE vehicle_id = $1
    `;
    const countResult = client
      ? await client.query<{ count: number }>(countQuery, [vehicleId])
      : await this.db.query<{ count: number }>(countQuery, [vehicleId]);
    const total = countResult.rows[0]?.count ?? 0;

    const dataQuery = `
      SELECT 
        vsh.*,
        CONCAT(u.first_name, ' ', u.last_name) AS changed_by_name
      FROM vehicle_status_history vsh
      LEFT JOIN users u ON u.id = vsh.changed_by
      WHERE vsh.vehicle_id = $1
      ORDER BY vsh.created_at DESC
      LIMIT $2 OFFSET $3
    `;
    const dataResult = client
      ? await client.query<VehicleStatusHistoryEntity>(dataQuery, [vehicleId, limit, offset])
      : await this.db.query<VehicleStatusHistoryEntity>(dataQuery, [vehicleId, limit, offset]);

    return { history: dataResult.rows, total };
  }

  async getFleetSummary(client?: PoolClient): Promise<FleetSummaryStats> {
    const query = `
      SELECT 
        COUNT(*)::int AS total_vehicles,
        COUNT(*) FILTER (WHERE status = 'ACTIVE' AND deleted_at IS NULL)::int AS active_vehicles,
        COUNT(*) FILTER (WHERE status = 'MAINTENANCE' AND deleted_at IS NULL)::int AS maintenance_vehicles,
        COUNT(*) FILTER (WHERE status = 'RESERVED' AND deleted_at IS NULL)::int AS reserved_vehicles,
        COUNT(*) FILTER (WHERE status = 'DECOMMISSIONED' OR deleted_at IS NOT NULL)::int AS decommissioned_vehicles,
        (SELECT COUNT(*)::int FROM vehicle_assignments WHERE status = 'ACTIVE') AS active_assignments
      FROM vehicles
    `;
    const result = client
      ? await client.query<FleetSummaryStats>(query)
      : await this.db.query<FleetSummaryStats>(query);

    return (
      result.rows[0] ?? {
        total_vehicles: 0,
        active_vehicles: 0,
        maintenance_vehicles: 0,
        reserved_vehicles: 0,
        decommissioned_vehicles: 0,
        active_assignments: 0,
      }
    );
  }

  async getActiveVehicleAssignment(
    vehicleId: string,
    client?: PoolClient,
  ): Promise<VehicleAssignmentEntity | null> {
    const query = `
      SELECT *
      FROM vehicle_assignments
      WHERE vehicle_id = $1 AND status = 'ACTIVE'
      ORDER BY start_at DESC
      LIMIT 1
    `;
    const result = client
      ? await client.query<VehicleAssignmentEntity>(query, [vehicleId])
      : await this.db.query<VehicleAssignmentEntity>(query, [vehicleId]);

    return result.rows[0] ?? null;
  }
}
