import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { CreateDriverDto } from '../dto/create-driver.dto';
import { UpdateDriverDto } from '../dto/update-driver.dto';

export interface DriverEntity {
  id: string;
  userId: string;
  employeeCode: string;
  licenseNumber: string;
  licenseCategory: string;
  licenseExpiryDate: string;
  dateOfJoining: string;
  employmentStatus: 'ACTIVE' | 'ON_LEAVE' | 'SUSPENDED' | 'TERMINATED';
  verificationStatus: 'PENDING' | 'VERIFIED' | 'REJECTED';
  ratingAverage: number;
  totalTrips: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  user?: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    phone: string | null;
    status: string;
  };
  emergencyContact?: {
    id: string;
    name: string;
    relationship: string;
    phone: string;
    email: string | null;
    isPrimary: boolean;
  } | null;
}

export interface PaginatedDriversResult {
  items: DriverEntity[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

@Injectable()
export class DriversRepository {
  constructor(private readonly db: DatabaseService) {}

  async create(data: CreateDriverDto, assignedBy: string): Promise<DriverEntity> {
    return this.db.withTransaction(async (client) => {
      // 1. Insert driver record
      const insertDriverQuery = `
        INSERT INTO drivers (
          user_id,
          employee_code,
          license_number,
          license_category,
          license_expiry_date,
          date_of_joining,
          employment_status,
          verification_status
        ) VALUES (
          $1, $2, $3, $4, $5,
          COALESCE($6::date, CURRENT_DATE),
          'ACTIVE',
          'PENDING'
        )
        RETURNING id;
      `;
      const driverRes = await client.query(insertDriverQuery, [
        data.userId,
        data.employeeCode,
        data.licenseNumber,
        data.licenseCategory,
        data.licenseExpiryDate,
        data.dateOfJoining || null,
      ]);
      const driverId = driverRes.rows[0].id;

      // 2. Assign DRIVER system role to user
      const assignRoleQuery = `
        INSERT INTO user_roles (user_id, role_id)
        SELECT $1, id FROM roles WHERE code = 'DRIVER'
        ON CONFLICT DO NOTHING;
      `;
      await client.query(assignRoleQuery, [data.userId]);

      // 3. Insert emergency contact if provided
      if (data.emergencyContact) {
        const contactQuery = `
          INSERT INTO driver_emergency_contacts (
            driver_id, name, relationship, phone, email, is_primary
          ) VALUES ($1, $2, $3, $4, $5, TRUE);
        `;
        await client.query(contactQuery, [
          driverId,
          data.emergencyContact.name,
          data.emergencyContact.relationship,
          data.emergencyContact.phone,
          data.emergencyContact.email || null,
        ]);
      }

      // 4. Record initial status history log
      const historyQuery = `
        INSERT INTO driver_status_history (
          driver_id, old_status, new_status, reason, changed_by
        ) VALUES ($1, 'INITIAL', 'ACTIVE', 'Initial driver provisioning', $2);
      `;
      await client.query(historyQuery, [driverId, assignedBy]);

      return this.findWithClient(client, driverId);
    });
  }

  async findById(id: string): Promise<DriverEntity | null> {
    const query = this.getBaseSelectQuery('d.id = $1 AND d.deleted_at IS NULL');
    const res = await this.db.query(query, [id]);
    return res.rows[0] ? this.mapRow(res.rows[0]) : null;
  }

  async findByUserId(userId: string): Promise<DriverEntity | null> {
    const query = this.getBaseSelectQuery('d.user_id = $1 AND d.deleted_at IS NULL');
    const res = await this.db.query(query, [userId]);
    return res.rows[0] ? this.mapRow(res.rows[0]) : null;
  }

  async findByEmployeeCode(code: string): Promise<DriverEntity | null> {
    const query = this.getBaseSelectQuery(
      'LOWER(d.employee_code) = LOWER($1) AND d.deleted_at IS NULL',
    );
    const res = await this.db.query(query, [code]);
    return res.rows[0] ? this.mapRow(res.rows[0]) : null;
  }

  async findByLicenseNumber(license: string): Promise<DriverEntity | null> {
    const query = this.getBaseSelectQuery(
      'LOWER(d.license_number) = LOWER($1) AND d.deleted_at IS NULL',
    );
    const res = await this.db.query(query, [license]);
    return res.rows[0] ? this.mapRow(res.rows[0]) : null;
  }

  async update(driverId: string, data: UpdateDriverDto): Promise<DriverEntity | null> {
    return this.db.withTransaction(async (client) => {
      const updates: string[] = [];
      const params: any[] = [];
      let idx = 1;

      if (data.licenseCategory !== undefined) {
        updates.push(`license_category = $${idx++}`);
        params.push(data.licenseCategory);
      }
      if (data.licenseExpiryDate !== undefined) {
        updates.push(`license_expiry_date = $${idx++}`);
        params.push(data.licenseExpiryDate);
      }

      if (updates.length > 0) {
        updates.push(`updated_at = CURRENT_TIMESTAMP`);
        params.push(driverId);
        const updateQuery = `
          UPDATE drivers
          SET ${updates.join(', ')}
          WHERE id = $${idx} AND deleted_at IS NULL;
        `;
        await client.query(updateQuery, params);
      }

      if (data.emergencyContact) {
        const contactQuery = `
          INSERT INTO driver_emergency_contacts (
            driver_id, name, relationship, phone, email, is_primary
          ) VALUES ($1, $2, $3, $4, $5, TRUE)
          ON CONFLICT DO NOTHING;
        `;
        await client.query(contactQuery, [
          driverId,
          data.emergencyContact.name,
          data.emergencyContact.relationship,
          data.emergencyContact.phone,
          data.emergencyContact.email || null,
        ]);
      }

      return this.findWithClient(client, driverId);
    });
  }

  async updateStatus(
    driverId: string,
    newStatus: string,
    reason: string | undefined,
    changedBy: string,
  ): Promise<boolean> {
    return this.db.withTransaction(async (client) => {
      const currentRes = await client.query(
        `SELECT employment_status FROM drivers WHERE id = $1 AND deleted_at IS NULL;`,
        [driverId],
      );
      if (currentRes.rows.length === 0) {
        return false;
      }

      const oldStatus = currentRes.rows[0].employment_status;
      if (oldStatus === newStatus) {
        return true; // No-op idempotent status transition
      }

      await client.query(
        `UPDATE drivers SET employment_status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2;`,
        [newStatus, driverId],
      );

      await client.query(
        `INSERT INTO driver_status_history (
          driver_id, old_status, new_status, reason, changed_by
        ) VALUES ($1, $2, $3, $4, $5);`,
        [driverId, oldStatus, newStatus, reason || null, changedBy],
      );

      return true;
    });
  }

  async findAll(options: {
    page: number;
    limit: number;
    search?: string;
    employmentStatus?: string;
    verificationStatus?: string;
  }): Promise<PaginatedDriversResult> {
    const { page, limit, search, employmentStatus, verificationStatus } = options;
    const offset = (page - 1) * limit;

    const conditions: string[] = ['d.deleted_at IS NULL'];
    const params: any[] = [];
    let idx = 1;

    if (search) {
      conditions.push(
        `(d.employee_code ILIKE $${idx} OR d.license_number ILIKE $${idx} OR u.first_name ILIKE $${idx} OR u.last_name ILIKE $${idx} OR u.email ILIKE $${idx})`,
      );
      params.push(`%${search}%`);
      idx++;
    }

    if (employmentStatus) {
      conditions.push(`d.employment_status = $${idx}`);
      params.push(employmentStatus);
      idx++;
    }

    if (verificationStatus) {
      conditions.push(`d.verification_status = $${idx}`);
      params.push(verificationStatus);
      idx++;
    }

    const whereClause = conditions.join(' AND ');

    const countQuery = `
      SELECT COUNT(*)::int AS total
      FROM drivers d
      JOIN users u ON u.id = d.user_id
      WHERE ${whereClause};
    `;
    const countRes = await this.db.query(countQuery, params);
    const total = countRes.rows[0]?.total || 0;

    const listQuery = `
      SELECT 
        d.id,
        d.user_id,
        d.employee_code,
        d.license_number,
        d.license_category,
        d.license_expiry_date::text AS license_expiry_date,
        d.date_of_joining::text AS date_of_joining,
        d.employment_status,
        d.verification_status,
        d.rating_average,
        d.total_trips,
        d.created_at,
        d.updated_at,
        d.deleted_at,
        json_build_object(
          'id', u.id,
          'email', u.email,
          'firstName', u.first_name,
          'lastName', u.last_name,
          'phone', u.phone,
          'status', u.status
        ) AS user,
        (
          SELECT json_build_object(
            'id', dec.id,
            'name', dec.name,
            'relationship', dec.relationship,
            'phone', dec.phone,
            'email', dec.email,
            'isPrimary', dec.is_primary
          )
          FROM driver_emergency_contacts dec
          WHERE dec.driver_id = d.id
          LIMIT 1
        ) AS emergency_contact
      FROM drivers d
      JOIN users u ON u.id = d.user_id
      WHERE ${whereClause}
      ORDER BY d.created_at DESC
      LIMIT $${idx} OFFSET $${idx + 1};
    `;

    params.push(limit, offset);
    const listRes = await this.db.query(listQuery, params);

    const items = listRes.rows.map((row) => this.mapRow(row));
    const totalPages = Math.ceil(total / limit);

    return {
      items,
      total,
      page,
      limit,
      totalPages,
    };
  }

  private async findWithClient(client: any, driverId: string): Promise<DriverEntity> {
    const query = this.getBaseSelectQuery('d.id = $1');
    const res = await client.query(query, [driverId]);
    return this.mapRow(res.rows[0]);
  }

  private getBaseSelectQuery(whereClause: string): string {
    return `
      SELECT 
        d.id,
        d.user_id,
        d.employee_code,
        d.license_number,
        d.license_category,
        d.license_expiry_date::text AS license_expiry_date,
        d.date_of_joining::text AS date_of_joining,
        d.employment_status,
        d.verification_status,
        d.rating_average,
        d.total_trips,
        d.created_at,
        d.updated_at,
        d.deleted_at,
        json_build_object(
          'id', u.id,
          'email', u.email,
          'firstName', u.first_name,
          'lastName', u.last_name,
          'phone', u.phone,
          'status', u.status
        ) AS user,
        (
          SELECT json_build_object(
            'id', dec.id,
            'name', dec.name,
            'relationship', dec.relationship,
            'phone', dec.phone,
            'email', dec.email,
            'isPrimary', dec.is_primary
          )
          FROM driver_emergency_contacts dec
          WHERE dec.driver_id = d.id
          LIMIT 1
        ) AS emergency_contact
      FROM drivers d
      JOIN users u ON u.id = d.user_id
      WHERE ${whereClause};
    `;
  }

  private mapRow(row: any): DriverEntity {
    return {
      id: row.id,
      userId: row.user_id,
      employeeCode: row.employee_code,
      licenseNumber: row.license_number,
      licenseCategory: row.license_category,
      licenseExpiryDate: row.license_expiry_date,
      dateOfJoining: row.date_of_joining,
      employmentStatus: row.employment_status,
      verificationStatus: row.verification_status,
      ratingAverage: parseFloat(row.rating_average) || 5.0,
      totalTrips: parseInt(row.total_trips, 10) || 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at || null,
      user: row.user || undefined,
      emergencyContact: row.emergency_contact || null,
    };
  }
}
