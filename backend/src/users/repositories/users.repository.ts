import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { UpdateProfileDto } from '../dto/update-profile.dto';

export interface UserProfileResponse {
  id: string;
  email: string;
  phone: string | null;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  gender: string | null;
  profileImageUrl: string | null;
  status: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  roles: string[];
  passengerProfile?: {
    preferredLanguage: string;
    preferredCurrency: string;
    accessibilityRequirements: string | null;
    specialRequirements: string | null;
  } | null;
  preferences?: {
    smsEnabled: boolean;
    emailEnabled: boolean;
    pushEnabled: boolean;
    marketingEnabled: boolean;
    tripUpdatesEnabled: boolean;
  } | null;
}

export interface PaginatedUsersResult {
  items: UserProfileResponse[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

@Injectable()
export class UsersRepository {
  constructor(private readonly db: DatabaseService) {}

  async findById(id: string, includeDeleted = false): Promise<UserProfileResponse | null> {
    const query = `
      SELECT 
        u.id,
        u.email,
        u.phone,
        u.first_name,
        u.last_name,
        u.date_of_birth,
        u.gender,
        u.profile_image_url,
        u.status,
        u.email_verified,
        u.phone_verified,
        u.last_login_at,
        u.created_at,
        u.updated_at,
        u.deleted_at,
        COALESCE(
          (
            SELECT json_agg(r.code)
            FROM user_roles ur
            JOIN roles r ON r.id = ur.role_id
            WHERE ur.user_id = u.id
          ),
          '[]'::json
        ) AS roles,
        (
          SELECT json_build_object(
            'preferredLanguage', pp.preferred_language,
            'preferredCurrency', pp.preferred_currency,
            'accessibilityRequirements', pp.accessibility_requirements,
            'specialRequirements', pp.special_requirements
          )
          FROM passenger_profiles pp
          WHERE pp.user_id = u.id
        ) AS passenger_profile,
        (
          SELECT json_build_object(
            'smsEnabled', up.sms_enabled,
            'emailEnabled', up.email_enabled,
            'pushEnabled', up.push_enabled,
            'marketingEnabled', up.marketing_enabled,
            'tripUpdatesEnabled', up.trip_updates_enabled
          )
          FROM user_preferences up
          WHERE up.user_id = u.id
        ) AS preferences
      FROM users u
      WHERE u.id = $1 AND ($2::boolean IS TRUE OR u.deleted_at IS NULL);
    `;

    const result = await this.db.query(query, [id, includeDeleted]);
    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return this.mapToResponse(row);
  }

  async updateProfile(userId: string, data: UpdateProfileDto): Promise<UserProfileResponse | null> {
    return this.db.withTransaction(async (client) => {
      // 1. Update master users table if applicable
      const userUpdates: string[] = [];
      const userParams: any[] = [];
      let paramIdx = 1;

      if (data.firstName !== undefined) {
        userUpdates.push(`first_name = $${paramIdx++}`);
        userParams.push(data.firstName);
      }
      if (data.lastName !== undefined) {
        userUpdates.push(`last_name = $${paramIdx++}`);
        userParams.push(data.lastName);
      }
      if (data.phone !== undefined) {
        userUpdates.push(`phone = $${paramIdx++}`);
        userParams.push(data.phone);
      }
      if (data.dateOfBirth !== undefined) {
        userUpdates.push(`date_of_birth = $${paramIdx++}`);
        userParams.push(data.dateOfBirth);
      }
      if (data.gender !== undefined) {
        userUpdates.push(`gender = $${paramIdx++}`);
        userParams.push(data.gender);
      }
      if (data.profileImageUrl !== undefined) {
        userUpdates.push(`profile_image_url = $${paramIdx++}`);
        userParams.push(data.profileImageUrl);
      }

      if (userUpdates.length > 0) {
        userUpdates.push(`updated_at = CURRENT_TIMESTAMP`);
        userParams.push(userId);
        const userUpdateQuery = `
          UPDATE users
          SET ${userUpdates.join(', ')}
          WHERE id = $${paramIdx} AND deleted_at IS NULL;
        `;
        await client.query(userUpdateQuery, userParams);
      }

      // 2. Update passenger_profiles if passenger-specific fields are provided
      const hasPassengerUpdates =
        data.dateOfBirth !== undefined ||
        data.gender !== undefined ||
        data.profileImageUrl !== undefined ||
        data.preferredLanguage !== undefined ||
        data.preferredCurrency !== undefined ||
        data.accessibilityRequirements !== undefined ||
        data.specialRequirements !== undefined;

      if (hasPassengerUpdates) {
        await client.query(
          `
          INSERT INTO passenger_profiles (
            user_id,
            date_of_birth,
            gender,
            profile_photo_url,
            preferred_language,
            preferred_currency,
            accessibility_requirements,
            special_requirements
          ) VALUES (
            $1, $2, $3, $4,
            COALESCE($5, 'en'),
            COALESCE($6, 'INR'),
            $7, $8
          )
          ON CONFLICT (user_id) DO UPDATE SET
            date_of_birth = COALESCE(EXCLUDED.date_of_birth, passenger_profiles.date_of_birth),
            gender = COALESCE(EXCLUDED.gender, passenger_profiles.gender),
            profile_photo_url = COALESCE(EXCLUDED.profile_photo_url, passenger_profiles.profile_photo_url),
            preferred_language = COALESCE(EXCLUDED.preferred_language, passenger_profiles.preferred_language),
            preferred_currency = COALESCE(EXCLUDED.preferred_currency, passenger_profiles.preferred_currency),
            accessibility_requirements = COALESCE(EXCLUDED.accessibility_requirements, passenger_profiles.accessibility_requirements),
            special_requirements = COALESCE(EXCLUDED.special_requirements, passenger_profiles.special_requirements),
            updated_at = CURRENT_TIMESTAMP;
          `,
          [
            userId,
            data.dateOfBirth ?? null,
            data.gender ?? null,
            data.profileImageUrl ?? null,
            data.preferredLanguage ?? null,
            data.preferredCurrency ?? null,
            data.accessibilityRequirements ?? null,
            data.specialRequirements ?? null,
          ],
        );
      }

      // 3. Update user_preferences if preference fields are provided
      const hasPrefUpdates =
        data.smsEnabled !== undefined ||
        data.emailEnabled !== undefined ||
        data.pushEnabled !== undefined ||
        data.marketingEnabled !== undefined ||
        data.tripUpdatesEnabled !== undefined;

      if (hasPrefUpdates) {
        await client.query(
          `
          INSERT INTO user_preferences (
            user_id,
            sms_enabled,
            email_enabled,
            push_enabled,
            marketing_enabled,
            trip_updates_enabled
          ) VALUES (
            $1,
            COALESCE($2, TRUE),
            COALESCE($3, TRUE),
            COALESCE($4, TRUE),
            COALESCE($5, FALSE),
            COALESCE($6, TRUE)
          )
          ON CONFLICT (user_id) DO UPDATE SET
            sms_enabled = COALESCE(EXCLUDED.sms_enabled, user_preferences.sms_enabled),
            email_enabled = COALESCE(EXCLUDED.email_enabled, user_preferences.email_enabled),
            push_enabled = COALESCE(EXCLUDED.push_enabled, user_preferences.push_enabled),
            marketing_enabled = COALESCE(EXCLUDED.marketing_enabled, user_preferences.marketing_enabled),
            trip_updates_enabled = COALESCE(EXCLUDED.trip_updates_enabled, user_preferences.trip_updates_enabled),
            updated_at = CURRENT_TIMESTAMP;
          `,
          [
            userId,
            data.smsEnabled ?? null,
            data.emailEnabled ?? null,
            data.pushEnabled ?? null,
            data.marketingEnabled ?? null,
            data.tripUpdatesEnabled ?? null,
          ],
        );
      }

      return this.findById(userId);
    });
  }

  async updateStatus(userId: string, status: string): Promise<boolean> {
    const result = await this.db.query(
      `
      UPDATE users
      SET status = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2 AND deleted_at IS NULL
      RETURNING id;
      `,
      [status, userId],
    );
    return result.rowCount !== null && result.rowCount > 0;
  }

  async softDelete(userId: string): Promise<boolean> {
    return this.db.withTransaction(async (client) => {
      const res = await client.query(
        `
        UPDATE users
        SET deleted_at = CURRENT_TIMESTAMP, status = 'DEACTIVATED', updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING id;
        `,
        [userId],
      );

      if (!res.rowCount || res.rowCount === 0) {
        return false;
      }

      // Revoke all active sessions
      await client.query(
        `
        UPDATE user_sessions
        SET is_revoked = TRUE
        WHERE user_id = $1 AND is_revoked IS FALSE;
        `,
        [userId],
      );

      return true;
    });
  }

  async findAll(options: {
    page: number;
    limit: number;
    search?: string;
    status?: string;
    role?: string;
  }): Promise<PaginatedUsersResult> {
    const { page, limit, search, status, role } = options;
    const offset = (page - 1) * limit;

    const conditions: string[] = ['u.deleted_at IS NULL'];
    const params: any[] = [];
    let paramIdx = 1;

    if (search) {
      conditions.push(
        `(u.email ILIKE $${paramIdx} OR u.first_name ILIKE $${paramIdx} OR u.last_name ILIKE $${paramIdx} OR u.phone ILIKE $${paramIdx})`,
      );
      params.push(`%${search}%`);
      paramIdx++;
    }

    if (status) {
      conditions.push(`u.status = $${paramIdx}`);
      params.push(status);
      paramIdx++;
    }

    if (role) {
      conditions.push(`EXISTS (
        SELECT 1 FROM user_roles ur
        JOIN roles r ON r.id = ur.role_id
        WHERE ur.user_id = u.id AND r.code = $${paramIdx}
      )`);
      params.push(role);
      paramIdx++;
    }

    const whereClause = conditions.join(' AND ');

    const countQuery = `
      SELECT COUNT(*)::int AS total
      FROM users u
      WHERE ${whereClause};
    `;
    const countResult = await this.db.query(countQuery, params);
    const total = countResult.rows[0]?.total || 0;

    const listQuery = `
      SELECT 
        u.id,
        u.email,
        u.phone,
        u.first_name,
        u.last_name,
        u.date_of_birth,
        u.gender,
        u.profile_image_url,
        u.status,
        u.email_verified,
        u.phone_verified,
        u.last_login_at,
        u.created_at,
        u.updated_at,
        COALESCE(
          (
            SELECT json_agg(r.code)
            FROM user_roles ur
            JOIN roles r ON r.id = ur.role_id
            WHERE ur.user_id = u.id
          ),
          '[]'::json
        ) AS roles
      FROM users u
      WHERE ${whereClause}
      ORDER BY u.created_at DESC
      LIMIT $${paramIdx} OFFSET $${paramIdx + 1};
    `;

    params.push(limit, offset);
    const listResult = await this.db.query(listQuery, params);

    const items = listResult.rows.map((row) => this.mapToResponse(row));
    const totalPages = Math.ceil(total / limit);

    return {
      items,
      total,
      page,
      limit,
      totalPages,
    };
  }

  private mapToResponse(row: any): UserProfileResponse {
    return {
      id: row.id,
      email: row.email,
      phone: row.phone,
      firstName: row.first_name,
      lastName: row.last_name,
      dateOfBirth: row.date_of_birth,
      gender: row.gender,
      profileImageUrl: row.profile_image_url,
      status: row.status,
      emailVerified: row.email_verified,
      phoneVerified: row.phone_verified,
      lastLoginAt: row.last_login_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      roles: Array.isArray(row.roles) ? row.roles : [],
      passengerProfile: row.passenger_profile || null,
      preferences: row.preferences || null,
    };
  }
}
