import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { NotificationChannel } from '../../notifications/dto/create-notification.dto';

export interface NotificationPreferenceEntity {
  id: string;
  user_id: string;
  channel: NotificationChannel;
  notification_category: string;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserPreferencesRow {
  id: string;
  user_id: string;
  sms_enabled: boolean;
  email_enabled: boolean;
  push_enabled: boolean;
  marketing_enabled: boolean;
  trip_updates_enabled: boolean;
  created_at: string;
  updated_at: string;
}

@Injectable()
export class NotificationPreferencesRepository {
  constructor(private readonly db: DatabaseService) {}

  async findPreferencesByUserId(userId: string): Promise<NotificationPreferenceEntity[]> {
    const query = `
      SELECT id, user_id, channel, notification_category, is_enabled, created_at, updated_at
      FROM notification_preferences
      WHERE user_id = $1
      ORDER BY channel ASC, notification_category ASC;
    `;
    const result = await this.db.query<NotificationPreferenceEntity>(query, [userId]);
    return result.rows;
  }

  async upsertPreference(
    userId: string,
    channel: NotificationChannel,
    category: string,
    isEnabled: boolean,
  ): Promise<NotificationPreferenceEntity> {
    const query = `
      INSERT INTO notification_preferences (
        user_id,
        channel,
        notification_category,
        is_enabled,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (user_id, channel, notification_category)
      DO UPDATE SET
        is_enabled = EXCLUDED.is_enabled,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *;
    `;
    const result = await this.db.query<NotificationPreferenceEntity>(query, [
      userId,
      channel,
      category,
      isEnabled,
    ]);
    return result.rows[0];
  }

  async findUserPreferencesRow(userId: string): Promise<UserPreferencesRow | null> {
    const query = `
      SELECT *
      FROM user_preferences
      WHERE user_id = $1;
    `;
    const result = await this.db.query<UserPreferencesRow>(query, [userId]);
    return result.rows[0] || null;
  }

  async upsertUserPreferencesRow(
    userId: string,
    data: {
      smsEnabled?: boolean;
      emailEnabled?: boolean;
      pushEnabled?: boolean;
      marketingEnabled?: boolean;
      tripUpdatesEnabled?: boolean;
    },
  ): Promise<UserPreferencesRow> {
    const query = `
      INSERT INTO user_preferences (
        user_id,
        sms_enabled,
        email_enabled,
        push_enabled,
        marketing_enabled,
        trip_updates_enabled,
        created_at,
        updated_at
      )
      VALUES (
        $1,
        COALESCE($2, TRUE),
        COALESCE($3, TRUE),
        COALESCE($4, TRUE),
        COALESCE($5, FALSE),
        COALESCE($6, TRUE),
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT (user_id)
      DO UPDATE SET
        sms_enabled = COALESCE($2, user_preferences.sms_enabled),
        email_enabled = COALESCE($3, user_preferences.email_enabled),
        push_enabled = COALESCE($4, user_preferences.push_enabled),
        marketing_enabled = COALESCE($5, user_preferences.marketing_enabled),
        trip_updates_enabled = COALESCE($6, user_preferences.trip_updates_enabled),
        updated_at = CURRENT_TIMESTAMP
      RETURNING *;
    `;
    const params = [
      userId,
      data.smsEnabled ?? null,
      data.emailEnabled ?? null,
      data.pushEnabled ?? null,
      data.marketingEnabled ?? null,
      data.tripUpdatesEnabled ?? null,
    ];
    const result = await this.db.query<UserPreferencesRow>(query, params);
    return result.rows[0];
  }

  async deleteUserPreferences(userId: string): Promise<number> {
    const query = `
      DELETE FROM notification_preferences
      WHERE user_id = $1;
    `;
    const result = await this.db.query(query, [userId]);
    return result.rowCount || 0;
  }
}
