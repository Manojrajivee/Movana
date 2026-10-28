import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { WitnessStatement } from '../dto/create-incident.dto';
import { QueryIncidentsDto } from '../dto/query-incidents.dto';

export interface IncidentTypeEntity {
  id: string;
  code: string;
  name: string;
  category: string;
  description: string | null;
  created_at: string;
}

export interface IncidentSeverityLevelEntity {
  id: string;
  code: string;
  name: string;
  level_rank: number;
  created_at: string;
}

export interface IncidentEntity {
  id: string;
  incident_number: string;
  trip_id: string | null;
  vehicle_id: string | null;
  driver_id: string | null;
  reported_by: string;
  incident_type_id: string;
  severity: string;
  title: string;
  description: string;
  latitude: number | null;
  longitude: number | null;
  occurred_at: string;
  reported_at: string;
  status: string;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface IncidentReportEntity {
  id: string;
  incident_id: string;
  submitted_by: string;
  report_details: string;
  witnesses: WitnessStatement[];
  created_at: string;
}

export interface IncidentWithReportsEntity extends IncidentEntity {
  incident_type_name?: string;
  incident_type_code?: string;
  reports?: IncidentReportEntity[];
}

@Injectable()
export class IncidentsRepository {
  private readonly logger = new Logger(IncidentsRepository.name);

  constructor(private readonly db: DatabaseService) {}

  async findIncidentTypes(): Promise<IncidentTypeEntity[]> {
    const query = `
      SELECT id, code, name, category, description, created_at
      FROM incident_types
      ORDER BY category ASC, name ASC;
    `;
    const res = await this.db.query<IncidentTypeEntity>(query);
    return res.rows;
  }

  async findSeverityLevels(): Promise<IncidentSeverityLevelEntity[]> {
    const query = `
      SELECT id, code, name, level_rank, created_at
      FROM incident_severity_levels
      ORDER BY level_rank ASC;
    `;
    const res = await this.db.query<IncidentSeverityLevelEntity>(query);
    return res.rows;
  }

  async findIncidentTypeByIdOrCode(idOrCode: string): Promise<IncidentTypeEntity | null> {
    const query = `
      SELECT id, code, name, category, description, created_at
      FROM incident_types
      WHERE id::text = $1 OR code = $1
      LIMIT 1;
    `;
    const res = await this.db.query<IncidentTypeEntity>(query, [idOrCode]);
    return res.rows[0] || null;
  }

  async validateTripExists(
    tripId: string,
  ): Promise<{ exists: boolean; vehicleId: string | null; driverId: string | null }> {
    const query = `
      SELECT id, vehicle_id, primary_driver_id
      FROM trips
      WHERE id = $1;
    `;
    const res = await this.db.query<{
      id: string;
      vehicle_id: string | null;
      primary_driver_id: string | null;
    }>(query, [tripId]);

    if (res.rows.length === 0) {
      return { exists: false, vehicleId: null, driverId: null };
    }

    return {
      exists: true,
      vehicleId: res.rows[0].vehicle_id,
      driverId: res.rows[0].primary_driver_id,
    };
  }

  async validateVehicleExists(vehicleId: string): Promise<boolean> {
    const query = `SELECT 1 FROM vehicles WHERE id = $1;`;
    const res = await this.db.query(query, [vehicleId]);
    return res.rows.length > 0;
  }

  async validateDriverExists(driverId: string): Promise<boolean> {
    const query = `SELECT 1 FROM drivers WHERE id = $1;`;
    const res = await this.db.query(query, [driverId]);
    return res.rows.length > 0;
  }

  async validateReporterTripAuthorization(
    userId: string,
    tripId: string,
    roles: string[] = [],
  ): Promise<boolean> {
    // 1. Staff override (Admins, Operators, Safety Officers)
    if (roles.includes('ADMIN') || roles.includes('OPERATOR') || roles.includes('SAFETY_OFFICER')) {
      return true;
    }

    // 2. Passenger Booking verification: User must have a booking on this trip
    const bookingQuery = `
      SELECT 1
      FROM bookings
      WHERE user_id = $1
        AND trip_id = $2
        AND status != 'CANCELLED'
      LIMIT 1;
    `;
    const bookingRes = await this.db.query(bookingQuery, [userId, tripId]);
    if (bookingRes.rows.length > 0) {
      return true;
    }

    // 3. Driver assignment verification: User is assigned driver for the trip
    const driverQuery = `
      SELECT 1
      FROM trips t
      JOIN drivers d ON (t.primary_driver_id = d.id OR t.secondary_driver_id = d.id)
      WHERE t.id = $2
        AND d.user_id = $1
      LIMIT 1;
    `;
    const driverRes = await this.db.query(driverQuery, [userId, tripId]);
    if (driverRes.rows.length > 0) {
      return true;
    }

    return false;
  }

  async createIncident(data: {
    incidentNumber: string;
    tripId: string | null;
    vehicleId: string | null;
    driverId: string | null;
    reportedBy: string;
    incidentTypeId: string;
    severity: string;
    title: string;
    description: string;
    latitude: number | null;
    longitude: number | null;
    occurredAt: string | null;
  }): Promise<IncidentEntity> {
    const query = `
      INSERT INTO incidents (
        incident_number,
        trip_id,
        vehicle_id,
        driver_id,
        reported_by,
        incident_type_id,
        severity,
        title,
        description,
        latitude,
        longitude,
        occurred_at,
        status,
        created_at,
        updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
        COALESCE($12::timestamptz, CURRENT_TIMESTAMP),
        'OPEN',
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
      RETURNING *;
    `;
    const params = [
      data.incidentNumber,
      data.tripId,
      data.vehicleId,
      data.driverId,
      data.reportedBy,
      data.incidentTypeId,
      data.severity,
      data.title,
      data.description,
      data.latitude,
      data.longitude,
      data.occurredAt,
    ];
    const res = await this.db.query<IncidentEntity>(query, params);
    return res.rows[0];
  }

  async createIncidentReport(
    incidentId: string,
    submittedBy: string,
    reportDetails: string,
    witnesses: WitnessStatement[] = [],
  ): Promise<IncidentReportEntity> {
    const query = `
      INSERT INTO incident_reports (
        incident_id,
        submitted_by,
        report_details,
        witnesses,
        created_at
      )
      VALUES ($1, $2, $3, $4::jsonb, CURRENT_TIMESTAMP)
      RETURNING *;
    `;
    const res = await this.db.query<IncidentReportEntity>(query, [
      incidentId,
      submittedBy,
      reportDetails,
      JSON.stringify(witnesses),
    ]);
    return res.rows[0];
  }

  async findIncidentById(id: string): Promise<IncidentWithReportsEntity | null> {
    const incidentQuery = `
      SELECT
        i.*,
        it.name as incident_type_name,
        it.code as incident_type_code
      FROM incidents i
      JOIN incident_types it ON i.incident_type_id = it.id
      WHERE i.id = $1;
    `;
    const incidentRes = await this.db.query<IncidentWithReportsEntity>(incidentQuery, [id]);
    if (incidentRes.rows.length === 0) {
      return null;
    }

    const incident = incidentRes.rows[0];

    const reportsQuery = `
      SELECT id, incident_id, submitted_by, report_details, witnesses, created_at
      FROM incident_reports
      WHERE incident_id = $1
      ORDER BY created_at ASC;
    `;
    const reportsRes = await this.db.query<IncidentReportEntity>(reportsQuery, [id]);
    incident.reports = reportsRes.rows;

    return incident;
  }

  async findIncidentsByReporter(userId: string): Promise<IncidentEntity[]> {
    const query = `
      SELECT
        i.*,
        it.name as incident_type_name,
        it.code as incident_type_code
      FROM incidents i
      JOIN incident_types it ON i.incident_type_id = it.id
      WHERE i.reported_by = $1
      ORDER BY i.created_at DESC;
    `;
    const res = await this.db.query<IncidentEntity>(query, [userId]);
    return res.rows;
  }

  async findIncidents(
    filter: QueryIncidentsDto,
  ): Promise<{ items: IncidentEntity[]; total: number }> {
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (filter.status) {
      conditions.push(`i.status = $${idx++}`);
      params.push(filter.status);
    }

    if (filter.severity) {
      conditions.push(`i.severity = $${idx++}`);
      params.push(filter.severity);
    }

    if (filter.tripId) {
      conditions.push(`i.trip_id = $${idx++}`);
      params.push(filter.tripId);
    }

    if (filter.vehicleId) {
      conditions.push(`i.vehicle_id = $${idx++}`);
      params.push(filter.vehicleId);
    }

    if (filter.driverId) {
      conditions.push(`i.driver_id = $${idx++}`);
      params.push(filter.driverId);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countQuery = `
      SELECT COUNT(*)::int AS total
      FROM incidents i
      ${whereClause};
    `;
    const countRes = await this.db.query<{ total: number }>(countQuery, params);
    const total = countRes.rows[0]?.total ?? 0;

    const dataQuery = `
      SELECT
        i.*,
        it.name as incident_type_name,
        it.code as incident_type_code
      FROM incidents i
      JOIN incident_types it ON i.incident_type_id = it.id
      ${whereClause}
      ORDER BY i.created_at DESC
      LIMIT $${idx++} OFFSET $${idx++};
    `;
    const dataParams = [...params, filter.limit, filter.offset];
    const dataRes = await this.db.query<IncidentEntity>(dataQuery, dataParams);

    return {
      items: dataRes.rows,
      total,
    };
  }
}
