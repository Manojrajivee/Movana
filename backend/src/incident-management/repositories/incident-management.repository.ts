import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { RedisService } from '../../redis/redis.service';
import { QueryIncidentManagementDto } from '../dto/query-incident-management.dto';

export interface IncidentEntity {
  id: string;
  incident_number: string;
  trip_id: string | null;
  vehicle_id: string | null;
  driver_id: string | null;
  reported_by: string;
  incident_type_id: string;
  incident_type_name?: string;
  incident_type_code?: string;
  reporter_name?: string;
  reporter_email?: string;
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

export interface IncidentActionEntity {
  id: string;
  incident_id: string;
  action_taken: string;
  taken_by: string;
  taken_by_name?: string;
  taken_by_email?: string;
  action_date: string;
  status: string;
  created_at: string;
}

export interface IncidentReportEntity {
  id: string;
  incident_id: string;
  submitted_by: string;
  submitted_by_name?: string;
  submitted_by_email?: string;
  report_details: string;
  witnesses: any;
  created_at: string;
}

export interface InvestigatorAssignment {
  incidentId: string;
  assignedTo: string;
  assignedToName?: string;
  assignedToEmail?: string;
  assignedBy: string;
  assignedAt: string;
  notes?: string;
}

const REDIS_ASSIGNMENT_PREFIX = 'movana:incident_assignments:';
const ASSIGNMENT_TTL_SECONDS = 30 * 24 * 3600; // 30 days

@Injectable()
export class IncidentManagementRepository {
  private readonly logger = new Logger(IncidentManagementRepository.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly redis: RedisService,
  ) {}

  async findIncidentById(id: string): Promise<IncidentEntity | null> {
    const query = `
      SELECT i.id, i.incident_number, i.trip_id, i.vehicle_id, i.driver_id,
             i.reported_by, i.incident_type_id, i.severity, i.title, i.description,
             i.latitude, i.longitude, i.occurred_at, i.reported_at, i.status,
             i.resolved_at, i.created_at, i.updated_at,
             it.name AS incident_type_name, it.code AS incident_type_code,
             u.full_name AS reporter_name, u.email AS reporter_email
      FROM incidents i
      LEFT JOIN incident_types it ON it.id = i.incident_type_id
      LEFT JOIN users u ON u.id = i.reported_by
      WHERE i.id = $1;
    `;
    const res = await this.db.query<IncidentEntity>(query, [id]);
    return res.rows[0] || null;
  }

  async updateIncidentStatus(
    id: string,
    status: string,
    resolvedAt: Date | null,
  ): Promise<IncidentEntity | null> {
    const query = `
      UPDATE incidents
      SET status = $2,
          resolved_at = $3,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *;
    `;
    const res = await this.db.query<IncidentEntity>(query, [id, status, resolvedAt]);
    return res.rows[0] || null;
  }

  async createIncidentAction(
    incidentId: string,
    actionTaken: string,
    takenBy: string,
    status: string = 'COMPLETED',
  ): Promise<IncidentActionEntity> {
    const query = `
      INSERT INTO incident_actions (incident_id, action_taken, taken_by, status, action_date, created_at)
      VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING id, incident_id, action_taken, taken_by, action_date, status, created_at;
    `;
    const res = await this.db.query<IncidentActionEntity>(query, [
      incidentId,
      actionTaken,
      takenBy,
      status,
    ]);
    return res.rows[0];
  }

  async findActionsByIncidentId(incidentId: string): Promise<IncidentActionEntity[]> {
    const query = `
      SELECT ia.id, ia.incident_id, ia.action_taken, ia.taken_by, ia.action_date, ia.status, ia.created_at,
             u.full_name AS taken_by_name, u.email AS taken_by_email
      FROM incident_actions ia
      LEFT JOIN users u ON u.id = ia.taken_by
      WHERE ia.incident_id = $1
      ORDER BY ia.action_date ASC, ia.created_at ASC;
    `;
    const res = await this.db.query<IncidentActionEntity>(query, [incidentId]);
    return res.rows;
  }

  async createIncidentReport(
    incidentId: string,
    submittedBy: string,
    reportDetails: string,
    witnesses: any[] = [],
  ): Promise<IncidentReportEntity> {
    const query = `
      INSERT INTO incident_reports (incident_id, submitted_by, report_details, witnesses, created_at)
      VALUES ($1, $2, $3, $4::jsonb, CURRENT_TIMESTAMP)
      RETURNING id, incident_id, submitted_by, report_details, witnesses, created_at;
    `;
    const res = await this.db.query<IncidentReportEntity>(query, [
      incidentId,
      submittedBy,
      reportDetails,
      JSON.stringify(witnesses),
    ]);
    return res.rows[0];
  }

  async findReportsByIncidentId(incidentId: string): Promise<IncidentReportEntity[]> {
    const query = `
      SELECT ir.id, ir.incident_id, ir.submitted_by, ir.report_details, ir.witnesses, ir.created_at,
             u.full_name AS submitted_by_name, u.email AS submitted_by_email
      FROM incident_reports ir
      LEFT JOIN users u ON u.id = ir.submitted_by
      WHERE ir.incident_id = $1
      ORDER BY ir.created_at ASC;
    `;
    const res = await this.db.query<IncidentReportEntity>(query, [incidentId]);
    return res.rows;
  }

  async validateUserExistsAndStaff(userId: string): Promise<{
    exists: boolean;
    isStaff: boolean;
    user?: { id: string; email: string; fullName: string; roles: string[] };
  }> {
    const query = `
      SELECT u.id, u.email, u.full_name, COALESCE(array_agg(r.code) FILTER (WHERE r.code IS NOT NULL), '{}') AS roles
      FROM users u
      LEFT JOIN user_roles ur ON ur.user_id = u.id
      LEFT JOIN roles r ON r.id = ur.role_id
      WHERE u.id = $1 AND u.is_active = TRUE
      GROUP BY u.id, u.email, u.full_name;
    `;
    const res = await this.db.query<{
      id: string;
      email: string;
      full_name: string;
      roles: string[];
    }>(query, [userId]);

    if (res.rows.length === 0) {
      return { exists: false, isStaff: false };
    }

    const row = res.rows[0];
    const roles = row.roles || [];
    const isStaff =
      roles.includes('ADMIN') || roles.includes('OPERATOR') || roles.includes('SAFETY_OFFICER');

    return {
      exists: true,
      isStaff,
      user: {
        id: row.id,
        email: row.email,
        fullName: row.full_name,
        roles,
      },
    };
  }

  async findIncidents(filter: QueryIncidentManagementDto): Promise<{
    incidents: IncidentEntity[];
    total: number;
  }> {
    const conditions: string[] = ['1=1'];
    const params: any[] = [];

    if (filter.status) {
      params.push(filter.status);
      conditions.push(`i.status = $${params.length}`);
    }

    if (filter.severity) {
      params.push(filter.severity);
      conditions.push(`i.severity = $${params.length}`);
    }

    const whereClause = conditions.join(' AND ');

    const countQuery = `
      SELECT COUNT(*)::int AS count
      FROM incidents i
      WHERE ${whereClause};
    `;
    const countRes = await this.db.query<{ count: number }>(countQuery, params);
    const total = countRes.rows[0]?.count || 0;

    params.push(filter.limit);
    const limitIdx = params.length;
    params.push(filter.offset);
    const offsetIdx = params.length;

    const dataQuery = `
      SELECT i.id, i.incident_number, i.trip_id, i.vehicle_id, i.driver_id,
             i.reported_by, i.incident_type_id, i.severity, i.title, i.description,
             i.latitude, i.longitude, i.occurred_at, i.reported_at, i.status,
             i.resolved_at, i.created_at, i.updated_at,
             it.name AS incident_type_name, it.code AS incident_type_code,
             u.full_name AS reporter_name, u.email AS reporter_email
      FROM incidents i
      LEFT JOIN incident_types it ON it.id = i.incident_type_id
      LEFT JOIN users u ON u.id = i.reported_by
      WHERE ${whereClause}
      ORDER BY i.reported_at DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx};
    `;

    const dataRes = await this.db.query<IncidentEntity>(dataQuery, params);
    return {
      incidents: dataRes.rows,
      total,
    };
  }

  async getAssignment(incidentId: string): Promise<InvestigatorAssignment | null> {
    try {
      const key = `${REDIS_ASSIGNMENT_PREFIX}${incidentId}`;
      const raw = await this.redis.get(key);
      if (!raw) {
        return null;
      }
      return JSON.parse(raw) as InvestigatorAssignment;
    } catch (err: any) {
      this.logger.warn(`Failed to parse assignment from Redis for ${incidentId}: ${err.message}`);
      return null;
    }
  }

  async saveAssignment(assignment: InvestigatorAssignment): Promise<void> {
    const key = `${REDIS_ASSIGNMENT_PREFIX}${assignment.incidentId}`;
    await this.redis.set(key, JSON.stringify(assignment), ASSIGNMENT_TTL_SECONDS);
  }
}
