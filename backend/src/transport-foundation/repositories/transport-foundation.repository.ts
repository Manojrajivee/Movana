import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../database/database.service';

export interface ServiceCalendarEntity {
  id: string;
  calendar_name: string;
  start_date: string;
  end_date: string;
  monday: boolean;
  tuesday: boolean;
  wednesday: boolean;
  thursday: boolean;
  friday: boolean;
  saturday: boolean;
  sunday: boolean;
  created_at: Date;
  updated_at: Date;
  exceptions_count?: number;
}

export interface ServiceCalendarExceptionEntity {
  id: string;
  service_calendar_id: string;
  exception_date: string;
  exception_type: 'ADDED' | 'REMOVED';
  description: string | null;
  created_at: Date;
}

@Injectable()
export class TransportFoundationRepository {
  constructor(private readonly db: DatabaseService) {}

  async createCalendar(
    data: {
      calendarName: string;
      startDate: string;
      endDate: string;
      monday?: boolean;
      tuesday?: boolean;
      wednesday?: boolean;
      thursday?: boolean;
      friday?: boolean;
      saturday?: boolean;
      sunday?: boolean;
    },
    client?: PoolClient,
  ): Promise<ServiceCalendarEntity> {
    const query = `
      INSERT INTO service_calendars (
        calendar_name,
        start_date,
        end_date,
        monday,
        tuesday,
        wednesday,
        thursday,
        friday,
        saturday,
        sunday
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;
    const params = [
      data.calendarName,
      data.startDate,
      data.endDate,
      data.monday ?? true,
      data.tuesday ?? true,
      data.wednesday ?? true,
      data.thursday ?? true,
      data.friday ?? true,
      data.saturday ?? true,
      data.sunday ?? true,
    ];

    const result = client
      ? await client.query<ServiceCalendarEntity>(query, params)
      : await this.db.query<ServiceCalendarEntity>(query, params);

    return result.rows[0];
  }

  async findCalendarById(id: string, client?: PoolClient): Promise<ServiceCalendarEntity | null> {
    const query = `
      SELECT
        c.*,
        COUNT(e.id)::int AS exceptions_count
      FROM service_calendars c
      LEFT JOIN service_calendar_exceptions e ON e.service_calendar_id = c.id
      WHERE c.id = $1
      GROUP BY c.id
    `;
    const result = client
      ? await client.query<ServiceCalendarEntity>(query, [id])
      : await this.db.query<ServiceCalendarEntity>(query, [id]);

    return result.rows[0] ?? null;
  }

  async findCalendars(
    options: {
      search?: string;
      activeOnDate?: string;
      limit: number;
      offset: number;
    },
    client?: PoolClient,
  ): Promise<{ calendars: ServiceCalendarEntity[]; total: number }> {
    const conditions: string[] = ['1=1'];
    const params: (string | number)[] = [];
    let paramIndex = 1;

    if (options.search) {
      conditions.push(`c.calendar_name ILIKE $${paramIndex++}`);
      params.push(`%${options.search}%`);
    }

    if (options.activeOnDate) {
      conditions.push(`$${paramIndex}::date BETWEEN c.start_date AND c.end_date`);
      params.push(options.activeOnDate);
      paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    const countQuery = `
      SELECT COUNT(*)::int AS total
      FROM service_calendars c
      WHERE ${whereClause}
    `;

    const countResult = client
      ? await client.query<{ total: number }>(countQuery, params)
      : await this.db.query<{ total: number }>(countQuery, params);

    const total = countResult.rows[0]?.total ?? 0;

    const dataQuery = `
      SELECT
        c.*,
        COUNT(e.id)::int AS exceptions_count
      FROM service_calendars c
      LEFT JOIN service_calendar_exceptions e ON e.service_calendar_id = c.id
      WHERE ${whereClause}
      GROUP BY c.id
      ORDER BY c.start_date DESC, c.created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;

    const dataParams = [...params, options.limit, options.offset];
    const dataResult = client
      ? await client.query<ServiceCalendarEntity>(dataQuery, dataParams)
      : await this.db.query<ServiceCalendarEntity>(dataQuery, dataParams);

    return { calendars: dataResult.rows, total };
  }

  async updateCalendar(
    id: string,
    data: {
      calendarName?: string;
      startDate?: string;
      endDate?: string;
      monday?: boolean;
      tuesday?: boolean;
      wednesday?: boolean;
      thursday?: boolean;
      friday?: boolean;
      saturday?: boolean;
      sunday?: boolean;
    },
    client?: PoolClient,
  ): Promise<ServiceCalendarEntity | null> {
    const fields: string[] = ['updated_at = CURRENT_TIMESTAMP'];
    const params: any[] = [];
    let idx = 1;

    if (data.calendarName !== undefined) {
      fields.push(`calendar_name = $${idx++}`);
      params.push(data.calendarName);
    }
    if (data.startDate !== undefined) {
      fields.push(`start_date = $${idx++}`);
      params.push(data.startDate);
    }
    if (data.endDate !== undefined) {
      fields.push(`end_date = $${idx++}`);
      params.push(data.endDate);
    }
    if (data.monday !== undefined) {
      fields.push(`monday = $${idx++}`);
      params.push(data.monday);
    }
    if (data.tuesday !== undefined) {
      fields.push(`tuesday = $${idx++}`);
      params.push(data.tuesday);
    }
    if (data.wednesday !== undefined) {
      fields.push(`wednesday = $${idx++}`);
      params.push(data.wednesday);
    }
    if (data.thursday !== undefined) {
      fields.push(`thursday = $${idx++}`);
      params.push(data.thursday);
    }
    if (data.friday !== undefined) {
      fields.push(`friday = $${idx++}`);
      params.push(data.friday);
    }
    if (data.saturday !== undefined) {
      fields.push(`saturday = $${idx++}`);
      params.push(data.saturday);
    }
    if (data.sunday !== undefined) {
      fields.push(`sunday = $${idx++}`);
      params.push(data.sunday);
    }

    params.push(id);
    const query = `
      UPDATE service_calendars
      SET ${fields.join(', ')}
      WHERE id = $${idx}
      RETURNING *
    `;

    const result = client
      ? await client.query<ServiceCalendarEntity>(query, params)
      : await this.db.query<ServiceCalendarEntity>(query, params);

    return result.rows[0] ?? null;
  }

  async deleteCalendar(id: string, client?: PoolClient): Promise<boolean> {
    const query = `DELETE FROM service_calendars WHERE id = $1 RETURNING id`;
    const result = client ? await client.query(query, [id]) : await this.db.query(query, [id]);

    return (result.rowCount ?? 0) > 0;
  }

  async createException(
    data: {
      serviceCalendarId: string;
      exceptionDate: string;
      exceptionType: 'ADDED' | 'REMOVED';
      description?: string | null;
    },
    client?: PoolClient,
  ): Promise<ServiceCalendarExceptionEntity> {
    const query = `
      INSERT INTO service_calendar_exceptions (
        service_calendar_id,
        exception_date,
        exception_type,
        description
      )
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    const params = [
      data.serviceCalendarId,
      data.exceptionDate,
      data.exceptionType,
      data.description ?? null,
    ];

    const result = client
      ? await client.query<ServiceCalendarExceptionEntity>(query, params)
      : await this.db.query<ServiceCalendarExceptionEntity>(query, params);

    return result.rows[0];
  }

  async findExceptionsByCalendarId(
    calendarId: string,
    client?: PoolClient,
  ): Promise<ServiceCalendarExceptionEntity[]> {
    const query = `
      SELECT *
      FROM service_calendar_exceptions
      WHERE service_calendar_id = $1
      ORDER BY exception_date ASC
    `;
    const result = client
      ? await client.query<ServiceCalendarExceptionEntity>(query, [calendarId])
      : await this.db.query<ServiceCalendarExceptionEntity>(query, [calendarId]);

    return result.rows;
  }

  async findExceptionById(
    id: string,
    client?: PoolClient,
  ): Promise<ServiceCalendarExceptionEntity | null> {
    const query = `SELECT * FROM service_calendar_exceptions WHERE id = $1`;
    const result = client
      ? await client.query<ServiceCalendarExceptionEntity>(query, [id])
      : await this.db.query<ServiceCalendarExceptionEntity>(query, [id]);

    return result.rows[0] ?? null;
  }

  async findExceptionByCalendarAndDate(
    calendarId: string,
    date: string,
    client?: PoolClient,
  ): Promise<ServiceCalendarExceptionEntity | null> {
    const query = `
      SELECT *
      FROM service_calendar_exceptions
      WHERE service_calendar_id = $1 AND exception_date = $2::date
    `;
    const result = client
      ? await client.query<ServiceCalendarExceptionEntity>(query, [calendarId, date])
      : await this.db.query<ServiceCalendarExceptionEntity>(query, [calendarId, date]);

    return result.rows[0] ?? null;
  }

  async deleteException(id: string, client?: PoolClient): Promise<boolean> {
    const query = `DELETE FROM service_calendar_exceptions WHERE id = $1 RETURNING id`;
    const result = client ? await client.query(query, [id]) : await this.db.query(query, [id]);

    return (result.rowCount ?? 0) > 0;
  }
}
