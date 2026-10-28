import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { CreateEmergencyContactDto } from '../dto/emergency-contact.dto';
import { EmergencyStatus, TriggerSosDto } from '../dto/trigger-sos.dto';

export interface EmergencyEventEntity {
  id: string;
  trip_id: string;
  vehicle_id: string;
  driver_id: string | null;
  user_id: string;
  emergency_type: string;
  latitude: number;
  longitude: number;
  status: EmergencyStatus;
  triggered_at: string;
  resolved_at: string | null;
  created_at: string;
}

export interface EmergencyContactEntity {
  id: string;
  user_id: string;
  name: string;
  relationship: string;
  phone: string;
  email: string | null;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
}

@Injectable()
export class SosRepository {
  constructor(private readonly db: DatabaseService) {}

  async createEmergencyEvent(
    dto: TriggerSosDto,
    userId: string,
    resolvedDriverId?: string | null,
  ): Promise<EmergencyEventEntity> {
    const query = `
      INSERT INTO emergency_events (
        trip_id,
        vehicle_id,
        driver_id,
        user_id,
        emergency_type,
        latitude,
        longitude,
        status,
        triggered_at,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'TRIGGERED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING *;
    `;
    const params = [
      dto.tripId,
      dto.vehicleId,
      dto.driverId || resolvedDriverId || null,
      userId,
      dto.emergencyType || 'SOS_BUTTON',
      dto.latitude,
      dto.longitude,
    ];
    const res = await this.db.query<EmergencyEventEntity>(query, params);
    return res.rows[0];
  }

  async findEmergencyEventById(id: string): Promise<EmergencyEventEntity | null> {
    const query = `
      SELECT *
      FROM emergency_events
      WHERE id = $1;
    `;
    const res = await this.db.query<EmergencyEventEntity>(query, [id]);
    return res.rows[0] || null;
  }

  async findActiveEmergencyEvents(): Promise<EmergencyEventEntity[]> {
    const query = `
      SELECT *
      FROM emergency_events
      WHERE status IN ('TRIGGERED', 'DISPATCHED')
      ORDER BY triggered_at DESC;
    `;
    const res = await this.db.query<EmergencyEventEntity>(query);
    return res.rows;
  }

  async findLatestActiveEventForUser(
    userId: string,
    tripId: string,
  ): Promise<EmergencyEventEntity | null> {
    const query = `
      SELECT *
      FROM emergency_events
      WHERE user_id = $1
        AND trip_id = $2
        AND status IN ('TRIGGERED', 'DISPATCHED')
      ORDER BY triggered_at DESC
      LIMIT 1;
    `;
    const res = await this.db.query<EmergencyEventEntity>(query, [userId, tripId]);
    return res.rows[0] || null;
  }

  async updateEmergencyStatus(
    id: string,
    status: EmergencyStatus,
    resolvedAt?: string | null,
  ): Promise<EmergencyEventEntity | null> {
    const query = `
      UPDATE emergency_events
      SET status = $2,
          resolved_at = CASE
            WHEN $2 IN ('RESOLVED', 'FALSE_ALARM') AND resolved_at IS NULL THEN COALESCE($3::timestamptz, CURRENT_TIMESTAMP)
            ELSE resolved_at
          END
      WHERE id = $1
      RETURNING *;
    `;
    const res = await this.db.query<EmergencyEventEntity>(query, [id, status, resolvedAt || null]);
    return res.rows[0] || null;
  }

  async createEmergencyContact(
    userId: string,
    dto: CreateEmergencyContactDto,
  ): Promise<EmergencyContactEntity> {
    if (dto.isPrimary) {
      // Clear existing primary flags for user
      await this.db.query(`UPDATE emergency_contacts SET is_primary = FALSE WHERE user_id = $1;`, [
        userId,
      ]);
    }

    const query = `
      INSERT INTO emergency_contacts (
        user_id,
        name,
        relationship,
        phone,
        email,
        is_primary,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING *;
    `;
    const params = [
      userId,
      dto.name,
      dto.relationship,
      dto.phone,
      dto.email || null,
      Boolean(dto.isPrimary),
    ];
    const res = await this.db.query<EmergencyContactEntity>(query, params);
    return res.rows[0];
  }

  async findContactsByUserId(userId: string): Promise<EmergencyContactEntity[]> {
    const query = `
      SELECT *
      FROM emergency_contacts
      WHERE user_id = $1
      ORDER BY is_primary DESC, created_at ASC;
    `;
    const res = await this.db.query<EmergencyContactEntity>(query, [userId]);
    return res.rows;
  }

  async findContactById(id: string): Promise<EmergencyContactEntity | null> {
    const query = `
      SELECT *
      FROM emergency_contacts
      WHERE id = $1;
    `;
    const res = await this.db.query<EmergencyContactEntity>(query, [id]);
    return res.rows[0] || null;
  }

  async deleteContact(id: string, userId: string): Promise<boolean> {
    const query = `
      DELETE FROM emergency_contacts
      WHERE id = $1
        AND user_id = $2
      RETURNING id;
    `;
    const res = await this.db.query(query, [id, userId]);
    return (res.rowCount || 0) > 0;
  }

  // Referential Integrity Validations
  async validateTripExists(tripId: string): Promise<boolean> {
    const query = `SELECT 1 FROM trips WHERE id = $1;`;
    const res = await this.db.query(query, [tripId]);
    return res.rows.length > 0;
  }

  async validateVehicleExists(vehicleId: string): Promise<boolean> {
    const query = `SELECT 1 FROM vehicles WHERE id = $1;`;
    const res = await this.db.query(query, [vehicleId]);
    return res.rows.length > 0;
  }

  async resolveDriverIdForTrip(tripId: string): Promise<string | null> {
    const query = `
      SELECT driver_id
      FROM trips
      WHERE id = $1;
    `;
    const res = await this.db.query<{ driver_id: string | null }>(query, [tripId]);
    return res.rows[0]?.driver_id || null;
  }
}
