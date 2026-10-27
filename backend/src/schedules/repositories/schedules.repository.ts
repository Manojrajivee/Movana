import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../database/database.service';

export interface TripScheduleEntity {
  id: string;
  schedule_code: string;
  route_id: string;
  service_calendar_id: string;
  departure_time: string;
  arrival_time: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  // Joined details
  route_code?: string;
  route_name?: string;
  calendar_name?: string;
  stops_count?: number;
}

export interface ScheduleStopEntity {
  id: string;
  schedule_id: string;
  stop_id: string;
  sequence_number: number;
  scheduled_arrival_offset_minutes: number;
  scheduled_departure_offset_minutes: number;
  created_at: Date;
  // Joined stop details
  stop_code?: string;
  stop_name?: string;
  stop_city?: string;
}

export interface RouteScheduleSummaryEntity {
  schedule_id: string;
  schedule_code: string;
  route_code: string;
  route_name: string;
  origin_stop_name: string;
  destination_stop_name: string;
  departure_time: string;
  arrival_time: string;
  calendar_name: string;
  monday: boolean;
  tuesday: boolean;
  wednesday: boolean;
  thursday: boolean;
  friday: boolean;
  saturday: boolean;
  sunday: boolean;
  is_active: boolean;
}

@Injectable()
export class SchedulesRepository {
  constructor(private readonly db: DatabaseService) {}

  async createSchedule(
    data: {
      scheduleCode: string;
      routeId: string;
      serviceCalendarId: string;
      departureTime: string;
      arrivalTime: string;
      isActive?: boolean;
    },
    client?: PoolClient,
  ): Promise<TripScheduleEntity> {
    const query = `
      INSERT INTO trip_schedules (
        schedule_code,
        route_id,
        service_calendar_id,
        departure_time,
        arrival_time,
        is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    const params = [
      data.scheduleCode,
      data.routeId,
      data.serviceCalendarId,
      data.departureTime,
      data.arrivalTime,
      data.isActive ?? true,
    ];

    const result = client
      ? await client.query<TripScheduleEntity>(query, params)
      : await this.db.query<TripScheduleEntity>(query, params);

    return result.rows[0];
  }

  async findByCode(scheduleCode: string, client?: PoolClient): Promise<TripScheduleEntity | null> {
    const query = `
      SELECT
        ts.*,
        r.route_code,
        r.name AS route_name,
        sc.calendar_name,
        COUNT(ss.id)::int AS stops_count
      FROM trip_schedules ts
      JOIN routes r ON r.id = ts.route_id
      JOIN service_calendars sc ON sc.id = ts.service_calendar_id
      LEFT JOIN schedule_stops ss ON ss.schedule_id = ts.id
      WHERE ts.schedule_code = $1
      GROUP BY ts.id, r.route_code, r.name, sc.calendar_name
    `;
    const result = client
      ? await client.query<TripScheduleEntity>(query, [scheduleCode])
      : await this.db.query<TripScheduleEntity>(query, [scheduleCode]);

    return result.rows[0] ?? null;
  }

  async findById(id: string, client?: PoolClient): Promise<TripScheduleEntity | null> {
    const query = `
      SELECT
        ts.*,
        r.route_code,
        r.name AS route_name,
        sc.calendar_name,
        COUNT(ss.id)::int AS stops_count
      FROM trip_schedules ts
      JOIN routes r ON r.id = ts.route_id
      JOIN service_calendars sc ON sc.id = ts.service_calendar_id
      LEFT JOIN schedule_stops ss ON ss.schedule_id = ts.id
      WHERE ts.id = $1
      GROUP BY ts.id, r.route_code, r.name, sc.calendar_name
    `;
    const result = client
      ? await client.query<TripScheduleEntity>(query, [id])
      : await this.db.query<TripScheduleEntity>(query, [id]);

    return result.rows[0] ?? null;
  }

  async findAll(params: {
    routeId?: string;
    serviceCalendarId?: string;
    isActive?: boolean;
    search?: string;
    limit: number;
    offset: number;
  }): Promise<{ items: TripScheduleEntity[]; total: number }> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (params.routeId) {
      conditions.push(`ts.route_id = $${idx++}`);
      values.push(params.routeId);
    }

    if (params.serviceCalendarId) {
      conditions.push(`ts.service_calendar_id = $${idx++}`);
      values.push(params.serviceCalendarId);
    }

    if (params.isActive !== undefined) {
      conditions.push(`ts.is_active = $${idx++}`);
      values.push(params.isActive);
    }

    if (params.search) {
      conditions.push(
        `(ts.schedule_code ILIKE $${idx} OR r.route_code ILIKE $${idx} OR r.name ILIKE $${idx} OR sc.calendar_name ILIKE $${idx})`,
      );
      values.push(`%${params.search}%`);
      idx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countQuery = `
      SELECT COUNT(ts.id)::int AS count
      FROM trip_schedules ts
      JOIN routes r ON r.id = ts.route_id
      JOIN service_calendars sc ON sc.id = ts.service_calendar_id
      ${whereClause}
    `;
    const countResult = await this.db.query<{ count: number }>(countQuery, values);
    const total = countResult.rows[0]?.count ?? 0;

    const dataQuery = `
      SELECT
        ts.*,
        r.route_code,
        r.name AS route_name,
        sc.calendar_name,
        COUNT(ss.id)::int AS stops_count
      FROM trip_schedules ts
      JOIN routes r ON r.id = ts.route_id
      JOIN service_calendars sc ON sc.id = ts.service_calendar_id
      LEFT JOIN schedule_stops ss ON ss.schedule_id = ts.id
      ${whereClause}
      GROUP BY ts.id, r.route_code, r.name, sc.calendar_name
      ORDER BY ts.departure_time ASC
      LIMIT $${idx++} OFFSET $${idx++}
    `;
    values.push(params.limit, params.offset);

    const dataResult = await this.db.query<TripScheduleEntity>(dataQuery, values);

    return { items: dataResult.rows, total };
  }

  async findScheduleSummary(params: {
    routeCode?: string;
    isActive?: boolean;
    limit: number;
    offset: number;
  }): Promise<{ items: RouteScheduleSummaryEntity[]; total: number }> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (params.routeCode) {
      conditions.push(`route_code ILIKE $${idx++}`);
      values.push(`%${params.routeCode}%`);
    }

    if (params.isActive !== undefined) {
      conditions.push(`is_active = $${idx++}`);
      values.push(params.isActive);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countQuery = `
      SELECT COUNT(*)::int AS count
      FROM vw_route_schedule_summary
      ${whereClause}
    `;
    const countResult = await this.db.query<{ count: number }>(countQuery, values);
    const total = countResult.rows[0]?.count ?? 0;

    const dataQuery = `
      SELECT *
      FROM vw_route_schedule_summary
      ${whereClause}
      ORDER BY route_code ASC, departure_time ASC
      LIMIT $${idx++} OFFSET $${idx++}
    `;
    values.push(params.limit, params.offset);

    const dataResult = await this.db.query<RouteScheduleSummaryEntity>(dataQuery, values);

    return { items: dataResult.rows, total };
  }

  async updateSchedule(
    id: string,
    data: {
      serviceCalendarId?: string;
      departureTime?: string;
      arrivalTime?: string;
      isActive?: boolean;
    },
    client?: PoolClient,
  ): Promise<TripScheduleEntity | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (data.serviceCalendarId !== undefined) {
      fields.push(`service_calendar_id = $${idx++}`);
      values.push(data.serviceCalendarId);
    }

    if (data.departureTime !== undefined) {
      fields.push(`departure_time = $${idx++}`);
      values.push(data.departureTime);
    }

    if (data.arrivalTime !== undefined) {
      fields.push(`arrival_time = $${idx++}`);
      values.push(data.arrivalTime);
    }

    if (data.isActive !== undefined) {
      fields.push(`is_active = $${idx++}`);
      values.push(data.isActive);
    }

    if (fields.length === 0) {
      return this.findById(id, client);
    }

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const query = `
      UPDATE trip_schedules
      SET ${fields.join(', ')}
      WHERE id = $${idx}
      RETURNING *
    `;

    const result = client
      ? await client.query<TripScheduleEntity>(query, values)
      : await this.db.query<TripScheduleEntity>(query, values);

    return result.rows[0] ?? null;
  }

  async deactivateSchedule(id: string, client?: PoolClient): Promise<TripScheduleEntity | null> {
    const query = `
      UPDATE trip_schedules
      SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;
    const result = client
      ? await client.query<TripScheduleEntity>(query, [id])
      : await this.db.query<TripScheduleEntity>(query, [id]);

    return result.rows[0] ?? null;
  }

  async addScheduleStop(
    data: {
      scheduleId: string;
      stopId: string;
      sequenceNumber: number;
      scheduledArrivalOffsetMinutes?: number;
      scheduledDepartureOffsetMinutes?: number;
    },
    client?: PoolClient,
  ): Promise<ScheduleStopEntity> {
    const query = `
      INSERT INTO schedule_stops (
        schedule_id,
        stop_id,
        sequence_number,
        scheduled_arrival_offset_minutes,
        scheduled_departure_offset_minutes
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    const params = [
      data.scheduleId,
      data.stopId,
      data.sequenceNumber,
      data.scheduledArrivalOffsetMinutes ?? 0,
      data.scheduledDepartureOffsetMinutes ?? 0,
    ];

    const result = client
      ? await client.query<ScheduleStopEntity>(query, params)
      : await this.db.query<ScheduleStopEntity>(query, params);

    return result.rows[0];
  }

  async findScheduleStops(scheduleId: string, client?: PoolClient): Promise<ScheduleStopEntity[]> {
    const query = `
      SELECT
        ss.*,
        s.stop_code,
        s.name AS stop_name,
        s.city AS stop_city
      FROM schedule_stops ss
      JOIN stops s ON s.id = ss.stop_id
      WHERE ss.schedule_id = $1
      ORDER BY ss.sequence_number ASC
    `;
    const result = client
      ? await client.query<ScheduleStopEntity>(query, [scheduleId])
      : await this.db.query<ScheduleStopEntity>(query, [scheduleId]);

    return result.rows;
  }

  async findScheduleStop(
    scheduleId: string,
    stopId: string,
    client?: PoolClient,
  ): Promise<ScheduleStopEntity | null> {
    const query = `
      SELECT
        ss.*,
        s.stop_code,
        s.name AS stop_name,
        s.city AS stop_city
      FROM schedule_stops ss
      JOIN stops s ON s.id = ss.stop_id
      WHERE ss.schedule_id = $1 AND ss.stop_id = $2
    `;
    const result = client
      ? await client.query<ScheduleStopEntity>(query, [scheduleId, stopId])
      : await this.db.query<ScheduleStopEntity>(query, [scheduleId, stopId]);

    return result.rows[0] ?? null;
  }

  async updateScheduleStop(
    scheduleId: string,
    stopId: string,
    data: {
      scheduledArrivalOffsetMinutes?: number;
      scheduledDepartureOffsetMinutes?: number;
    },
    client?: PoolClient,
  ): Promise<ScheduleStopEntity | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (data.scheduledArrivalOffsetMinutes !== undefined) {
      fields.push(`scheduled_arrival_offset_minutes = $${idx++}`);
      values.push(data.scheduledArrivalOffsetMinutes);
    }

    if (data.scheduledDepartureOffsetMinutes !== undefined) {
      fields.push(`scheduled_departure_offset_minutes = $${idx++}`);
      values.push(data.scheduledDepartureOffsetMinutes);
    }

    if (fields.length === 0) {
      return this.findScheduleStop(scheduleId, stopId, client);
    }

    values.push(scheduleId, stopId);

    const query = `
      UPDATE schedule_stops
      SET ${fields.join(', ')}
      WHERE schedule_id = $${idx++} AND stop_id = $${idx++}
      RETURNING *
    `;

    const result = client
      ? await client.query<ScheduleStopEntity>(query, values)
      : await this.db.query<ScheduleStopEntity>(query, values);

    return result.rows[0] ?? null;
  }

  async deleteScheduleStop(
    scheduleId: string,
    stopId: string,
    client?: PoolClient,
  ): Promise<ScheduleStopEntity | null> {
    const query = `
      DELETE FROM schedule_stops
      WHERE schedule_id = $1 AND stop_id = $2
      RETURNING *
    `;
    const result = client
      ? await client.query<ScheduleStopEntity>(query, [scheduleId, stopId])
      : await this.db.query<ScheduleStopEntity>(query, [scheduleId, stopId]);

    return result.rows[0] ?? null;
  }

  async findRouteStopsForRoute(
    routeId: string,
    client?: PoolClient,
  ): Promise<
    Array<{
      stop_id: string;
      sequence_number: number;
      arrival_offset_minutes: number;
      departure_offset_minutes: number;
    }>
  > {
    const query = `
      SELECT
        stop_id,
        sequence_number,
        arrival_offset_minutes,
        departure_offset_minutes
      FROM route_stops
      WHERE route_id = $1
      ORDER BY sequence_number ASC
    `;
    const result = client
      ? await client.query(query, [routeId])
      : await this.db.query(query, [routeId]);

    return result.rows;
  }

  async checkRouteActive(routeId: string): Promise<boolean> {
    const query = `
      SELECT id FROM routes WHERE id = $1 AND status = 'ACTIVE' AND deleted_at IS NULL
    `;
    const result = await this.db.query(query, [routeId]);
    return (result.rowCount ?? 0) > 0;
  }

  async checkCalendarExists(calendarId: string): Promise<boolean> {
    const query = `SELECT id FROM service_calendars WHERE id = $1`;
    const result = await this.db.query(query, [calendarId]);
    return (result.rowCount ?? 0) > 0;
  }

  async checkStopExists(stopId: string): Promise<boolean> {
    const query = `SELECT id FROM stops WHERE id = $1`;
    const result = await this.db.query(query, [stopId]);
    return (result.rowCount ?? 0) > 0;
  }
}
