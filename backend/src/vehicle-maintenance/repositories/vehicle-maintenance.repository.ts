import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../database/database.service';

export interface MaintenanceScheduleEntity {
  id: string;
  vehicle_type_id: string | null;
  vehicle_id: string | null;
  service_name: string;
  interval_km: number;
  interval_days: number;
  description: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  vehicle_registration_number?: string;
  vehicle_type_name?: string;
}

export interface MaintenanceRecordEntity {
  id: string;
  vehicle_id: string;
  maintenance_type: string;
  scheduled_date: string;
  completed_date: string | null;
  odometer: string | number;
  cost: string | number;
  currency: string;
  vendor: string;
  description: string;
  technician: string;
  next_due_date: string | null;
  status: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  created_at: Date;
  updated_at: Date;
  vehicle_registration_number?: string;
  vehicle_code?: string;
}

export interface VehicleInspectionEntity {
  id: string;
  vehicle_id: string;
  inspection_type: string;
  inspector_id: string;
  trip_id: string | null;
  inspection_date: Date;
  status: 'PASSED' | 'FAILED' | 'NEEDS_REPAIR';
  odometer: string | number;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
  vehicle_registration_number?: string;
  vehicle_code?: string;
  inspector_name?: string;
}

@Injectable()
export class VehicleMaintenanceRepository {
  constructor(private readonly db: DatabaseService) {}

  async createSchedule(
    data: {
      serviceName: string;
      vehicleTypeId?: string | null;
      vehicleId?: string | null;
      intervalKm: number;
      intervalDays: number;
      description?: string | null;
      isActive: boolean;
    },
    client?: PoolClient,
  ): Promise<MaintenanceScheduleEntity> {
    const query = `
      INSERT INTO maintenance_schedules (
        service_name, vehicle_type_id, vehicle_id, interval_km, interval_days, description, is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
    const params = [
      data.serviceName,
      data.vehicleTypeId ?? null,
      data.vehicleId ?? null,
      data.intervalKm,
      data.intervalDays,
      data.description ?? null,
      data.isActive,
    ];

    const result = client
      ? await client.query<MaintenanceScheduleEntity>(query, params)
      : await this.db.query<MaintenanceScheduleEntity>(query, params);

    return result.rows[0];
  }

  async findSchedules(
    options: { vehicleId?: string; vehicleTypeId?: string; isActive?: boolean },
    client?: PoolClient,
  ): Promise<MaintenanceScheduleEntity[]> {
    const conditions: string[] = [];
    const params: (string | boolean)[] = [];
    let paramIndex = 1;

    if (options.vehicleId) {
      conditions.push(`ms.vehicle_id = $${paramIndex++}`);
      params.push(options.vehicleId);
    }

    if (options.vehicleTypeId) {
      conditions.push(`ms.vehicle_type_id = $${paramIndex++}`);
      params.push(options.vehicleTypeId);
    }

    if (options.isActive !== undefined) {
      conditions.push(`ms.is_active = $${paramIndex++}`);
      params.push(options.isActive);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const query = `
      SELECT 
        ms.*,
        v.registration_number AS vehicle_registration_number,
        vt.name AS vehicle_type_name
      FROM maintenance_schedules ms
      LEFT JOIN vehicles v ON v.id = ms.vehicle_id
      LEFT JOIN vehicle_types vt ON vt.id = ms.vehicle_type_id
      ${whereClause}
      ORDER BY ms.created_at DESC
    `;

    const result = client
      ? await client.query<MaintenanceScheduleEntity>(query, params)
      : await this.db.query<MaintenanceScheduleEntity>(query, params);

    return result.rows;
  }

  async findScheduleById(
    id: string,
    client?: PoolClient,
  ): Promise<MaintenanceScheduleEntity | null> {
    const query = `
      SELECT 
        ms.*,
        v.registration_number AS vehicle_registration_number,
        vt.name AS vehicle_type_name
      FROM maintenance_schedules ms
      LEFT JOIN vehicles v ON v.id = ms.vehicle_id
      LEFT JOIN vehicle_types vt ON vt.id = ms.vehicle_type_id
      WHERE ms.id = $1
    `;
    const result = client
      ? await client.query<MaintenanceScheduleEntity>(query, [id])
      : await this.db.query<MaintenanceScheduleEntity>(query, [id]);

    return result.rows[0] ?? null;
  }

  async createRecord(
    data: {
      vehicleId: string;
      maintenanceType: string;
      scheduledDate: string;
      odometer: number;
      cost: number;
      currency: string;
      vendor: string;
      description: string;
      technician: string;
      nextDueDate?: string | null;
    },
    client?: PoolClient,
  ): Promise<MaintenanceRecordEntity> {
    const query = `
      INSERT INTO maintenance_records (
        vehicle_id, maintenance_type, scheduled_date, odometer, cost,
        currency, vendor, description, technician, next_due_date, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'SCHEDULED')
      RETURNING *
    `;
    const params = [
      data.vehicleId,
      data.maintenanceType,
      data.scheduledDate,
      data.odometer,
      data.cost,
      data.currency,
      data.vendor,
      data.description,
      data.technician,
      data.nextDueDate ?? null,
    ];

    const result = client
      ? await client.query<MaintenanceRecordEntity>(query, params)
      : await this.db.query<MaintenanceRecordEntity>(query, params);

    return result.rows[0];
  }

  async findRecords(
    options: {
      vehicleId?: string;
      status?: string;
      from?: string;
      to?: string;
      limit: number;
      offset: number;
    },
    client?: PoolClient,
  ): Promise<{ records: MaintenanceRecordEntity[]; total: number }> {
    const conditions: string[] = [];
    const params: (string | number)[] = [];
    let paramIndex = 1;

    if (options.vehicleId) {
      conditions.push(`mr.vehicle_id = $${paramIndex++}`);
      params.push(options.vehicleId);
    }

    if (options.status) {
      conditions.push(`mr.status = $${paramIndex++}`);
      params.push(options.status);
    }

    if (options.from) {
      conditions.push(`mr.scheduled_date >= $${paramIndex++}`);
      params.push(options.from);
    }

    if (options.to) {
      conditions.push(`mr.scheduled_date <= $${paramIndex++}`);
      params.push(options.to);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countQuery = `
      SELECT COUNT(*)::int AS count
      FROM maintenance_records mr
      ${whereClause}
    `;
    const countResult = client
      ? await client.query<{ count: number }>(countQuery, params)
      : await this.db.query<{ count: number }>(countQuery, params);
    const total = countResult.rows[0]?.count ?? 0;

    const dataQuery = `
      SELECT 
        mr.*,
        v.registration_number AS vehicle_registration_number,
        v.vehicle_code AS vehicle_code
      FROM maintenance_records mr
      JOIN vehicles v ON v.id = mr.vehicle_id
      ${whereClause}
      ORDER BY mr.scheduled_date DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;
    params.push(options.limit, options.offset);

    const dataResult = client
      ? await client.query<MaintenanceRecordEntity>(dataQuery, params)
      : await this.db.query<MaintenanceRecordEntity>(dataQuery, params);

    return { records: dataResult.rows, total };
  }

  async findRecordById(id: string, client?: PoolClient): Promise<MaintenanceRecordEntity | null> {
    const query = `
      SELECT 
        mr.*,
        v.registration_number AS vehicle_registration_number,
        v.vehicle_code AS vehicle_code
      FROM maintenance_records mr
      JOIN vehicles v ON v.id = mr.vehicle_id
      WHERE mr.id = $1
    `;
    const result = client
      ? await client.query<MaintenanceRecordEntity>(query, [id])
      : await this.db.query<MaintenanceRecordEntity>(query, [id]);

    return result.rows[0] ?? null;
  }

  async updateRecordStatus(
    id: string,
    status: 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED',
    completedDate?: string | null,
    client?: PoolClient,
  ): Promise<MaintenanceRecordEntity | null> {
    const completedClause = completedDate !== undefined ? ', completed_date = $2' : '';
    const query = `
      UPDATE maintenance_records
      SET status = $1, updated_at = CURRENT_TIMESTAMP ${completedClause}
      WHERE id = ${completedDate !== undefined ? '$3' : '$2'}
      RETURNING *
    `;
    const params = completedDate !== undefined ? [status, completedDate, id] : [status, id];

    const result = client
      ? await client.query<MaintenanceRecordEntity>(query, params)
      : await this.db.query<MaintenanceRecordEntity>(query, params);

    return result.rows[0] ?? null;
  }

  async createInspection(
    data: {
      vehicleId: string;
      inspectionType: string;
      inspectorId: string;
      tripId?: string | null;
      status: string;
      odometer: number;
      notes?: string | null;
    },
    client?: PoolClient,
  ): Promise<VehicleInspectionEntity> {
    const query = `
      INSERT INTO vehicle_inspections (
        vehicle_id, inspection_type, inspector_id, trip_id, status, odometer, notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
    const params = [
      data.vehicleId,
      data.inspectionType,
      data.inspectorId,
      data.tripId ?? null,
      data.status,
      data.odometer,
      data.notes ?? null,
    ];

    const result = client
      ? await client.query<VehicleInspectionEntity>(query, params)
      : await this.db.query<VehicleInspectionEntity>(query, params);

    return result.rows[0];
  }

  async findInspections(
    options: {
      vehicleId?: string;
      inspectionType?: string;
      status?: string;
      from?: string;
      to?: string;
      limit: number;
      offset: number;
    },
    client?: PoolClient,
  ): Promise<{ inspections: VehicleInspectionEntity[]; total: number }> {
    const conditions: string[] = [];
    const params: (string | number)[] = [];
    let paramIndex = 1;

    if (options.vehicleId) {
      conditions.push(`vi.vehicle_id = $${paramIndex++}`);
      params.push(options.vehicleId);
    }

    if (options.inspectionType) {
      conditions.push(`vi.inspection_type = $${paramIndex++}`);
      params.push(options.inspectionType);
    }

    if (options.status) {
      conditions.push(`vi.status = $${paramIndex++}`);
      params.push(options.status);
    }

    if (options.from) {
      conditions.push(`vi.inspection_date >= $${paramIndex++}`);
      params.push(options.from);
    }

    if (options.to) {
      conditions.push(`vi.inspection_date <= $${paramIndex++}`);
      params.push(options.to);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countQuery = `
      SELECT COUNT(*)::int AS count
      FROM vehicle_inspections vi
      ${whereClause}
    `;
    const countResult = client
      ? await client.query<{ count: number }>(countQuery, params)
      : await this.db.query<{ count: number }>(countQuery, params);
    const total = countResult.rows[0]?.count ?? 0;

    const dataQuery = `
      SELECT 
        vi.*,
        v.registration_number AS vehicle_registration_number,
        v.vehicle_code AS vehicle_code,
        CONCAT(u.first_name, ' ', u.last_name) AS inspector_name
      FROM vehicle_inspections vi
      JOIN vehicles v ON v.id = vi.vehicle_id
      JOIN users u ON u.id = vi.inspector_id
      ${whereClause}
      ORDER BY vi.inspection_date DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;
    params.push(options.limit, options.offset);

    const dataResult = client
      ? await client.query<VehicleInspectionEntity>(dataQuery, params)
      : await this.db.query<VehicleInspectionEntity>(dataQuery, params);

    return { inspections: dataResult.rows, total };
  }

  async findInspectionById(
    id: string,
    client?: PoolClient,
  ): Promise<VehicleInspectionEntity | null> {
    const query = `
      SELECT 
        vi.*,
        v.registration_number AS vehicle_registration_number,
        v.vehicle_code AS vehicle_code,
        CONCAT(u.first_name, ' ', u.last_name) AS inspector_name
      FROM vehicle_inspections vi
      JOIN vehicles v ON v.id = vi.vehicle_id
      JOIN users u ON u.id = vi.inspector_id
      WHERE vi.id = $1
    `;
    const result = client
      ? await client.query<VehicleInspectionEntity>(query, [id])
      : await this.db.query<VehicleInspectionEntity>(query, [id]);

    return result.rows[0] ?? null;
  }
}
