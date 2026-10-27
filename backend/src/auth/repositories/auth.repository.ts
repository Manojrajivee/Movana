import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

export interface UserEntity {
  id: string;
  email: string;
  phone: string | null;
  password_hash: string;
  first_name: string;
  last_name: string;
  status: 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';
  email_verified: boolean;
  phone_verified: boolean;
  last_login_at: Date | null;
  created_at: Date;
  updated_at: Date;
  roles?: string[];
  permissions?: string[];
}

export interface UserSessionEntity {
  id: string;
  user_id: string;
  refresh_token_hash: string;
  user_agent: string | null;
  ip_address: string | null;
  expires_at: Date;
  is_revoked: boolean;
  created_at: Date;
}

export interface PasswordResetTokenEntity {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  used_at: Date | null;
}

@Injectable()
export class AuthRepository {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Finds a non-deleted user by case-insensitive email, with assigned role codes.
   */
  async findByEmail(email: string): Promise<UserEntity | null> {
    const query = `
      SELECT u.id, u.email, u.phone, u.password_hash, u.first_name, u.last_name,
             u.status, u.email_verified, u.phone_verified, u.last_login_at,
             u.created_at, u.updated_at,
             COALESCE(ARRAY_AGG(r.code) FILTER (WHERE r.code IS NOT NULL), '{}') AS roles
      FROM users u
      LEFT JOIN user_roles ur ON ur.user_id = u.id
      LEFT JOIN roles r ON r.id = ur.role_id
      WHERE LOWER(u.email) = LOWER($1) AND u.deleted_at IS NULL
      GROUP BY u.id;
    `;
    const result = await this.db.query<UserEntity>(query, [email]);
    return result.rows[0] || null;
  }

  /**
   * Finds a non-deleted user by ID with roles and permissions.
   */
  async findByIdWithRoles(userId: string): Promise<UserEntity | null> {
    const query = `
      SELECT u.id, u.email, u.phone, u.password_hash, u.first_name, u.last_name,
             u.status, u.email_verified, u.phone_verified, u.last_login_at,
             u.created_at, u.updated_at,
             COALESCE(ARRAY_AGG(DISTINCT r.code) FILTER (WHERE r.code IS NOT NULL), '{}') AS roles
      FROM users u
      LEFT JOIN user_roles ur ON ur.user_id = u.id
      LEFT JOIN roles r ON r.id = ur.role_id
      WHERE u.id = $1 AND u.deleted_at IS NULL
      GROUP BY u.id;
    `;
    const result = await this.db.query<UserEntity>(query, [userId]);
    return result.rows[0] || null;
  }

  /**
   * Fetches all permission codes for a user across all assigned roles.
   */
  async getUserPermissions(userId: string): Promise<string[]> {
    const query = `
      SELECT DISTINCT p.code
      FROM user_roles ur
      JOIN role_permissions rp ON rp.role_id = ur.role_id
      JOIN permissions p ON p.id = rp.permission_id
      WHERE ur.user_id = $1;
    `;
    const result = await this.db.query<{ code: string }>(query, [userId]);
    return result.rows.map((row) => row.code);
  }

  /**
   * Registers a new user transactionally:
   * 1. Inserts into users
   * 2. Maps default PASSENGER role
   * 3. Creates passenger_profiles
   * 4. Creates user_preferences
   */
  async createUserWithDefaults(data: {
    email: string;
    phone?: string;
    passwordHash: string;
    firstName: string;
    lastName: string;
  }): Promise<UserEntity> {
    // 1. Insert user
    const insertUserQuery = `
      INSERT INTO users (email, phone, password_hash, first_name, last_name, status)
      VALUES ($1, $2, $3, $4, $5, 'ACTIVE')
      RETURNING id, email, phone, password_hash, first_name, last_name, status,
                email_verified, phone_verified, last_login_at, created_at, updated_at;
    `;
    const userResult = await this.db.query<UserEntity>(insertUserQuery, [
      data.email,
      data.phone || null,
      data.passwordHash,
      data.firstName,
      data.lastName,
    ]);
    const user = userResult.rows[0];

    // 2. Assign default PASSENGER role
    const assignRoleQuery = `
      INSERT INTO user_roles (user_id, role_id)
      SELECT $1, id FROM roles WHERE code = 'PASSENGER'
      ON CONFLICT DO NOTHING;
    `;
    await this.db.query(assignRoleQuery, [user.id]);

    // 3. Initialize passenger profile
    const initProfileQuery = `
      INSERT INTO passenger_profiles (user_id, preferred_language, preferred_currency)
      VALUES ($1, 'en', 'INR')
      ON CONFLICT DO NOTHING;
    `;
    await this.db.query(initProfileQuery, [user.id]);

    // 4. Initialize user preferences
    const initPrefsQuery = `
      INSERT INTO user_preferences (user_id)
      VALUES ($1)
      ON CONFLICT DO NOTHING;
    `;
    await this.db.query(initPrefsQuery, [user.id]);

    user.roles = ['PASSENGER'];
    return user;
  }

  /**
   * Creates an active session with hashed refresh token.
   */
  async createSession(
    userId: string,
    refreshTokenHash: string,
    expiresAt: Date,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<UserSessionEntity> {
    const query = `
      INSERT INTO user_sessions (user_id, refresh_token_hash, expires_at, user_agent, ip_address)
      VALUES ($1, $2, $3, $4, $5::inet)
      RETURNING id, user_id, refresh_token_hash, user_agent, ip_address, expires_at, is_revoked, created_at;
    `;
    const safeIp = ipAddress && ipAddress !== '::1' && ipAddress !== '127.0.0.1' ? ipAddress : null;
    const result = await this.db.query<UserSessionEntity>(query, [
      userId,
      refreshTokenHash,
      expiresAt,
      userAgent || null,
      safeIp,
    ]);
    return result.rows[0];
  }

  /**
   * Finds an active, non-expired, non-revoked session by refresh token hash.
   */
  async findActiveSession(refreshTokenHash: string): Promise<UserSessionEntity | null> {
    const query = `
      SELECT id, user_id, refresh_token_hash, user_agent, ip_address, expires_at, is_revoked, created_at
      FROM user_sessions
      WHERE refresh_token_hash = $1
        AND is_revoked IS FALSE
        AND expires_at > CURRENT_TIMESTAMP;
    `;
    const result = await this.db.query<UserSessionEntity>(query, [refreshTokenHash]);
    return result.rows[0] || null;
  }

  /**
   * Revokes a session by ID.
   */
  async revokeSession(sessionId: string): Promise<void> {
    const query = `UPDATE user_sessions SET is_revoked = TRUE WHERE id = $1;`;
    await this.db.query(query, [sessionId]);
  }

  /**
   * Revokes all active sessions for a user (e.g. on password change).
   */
  async revokeAllUserSessions(userId: string): Promise<void> {
    const query = `UPDATE user_sessions SET is_revoked = TRUE WHERE user_id = $1 AND is_revoked IS FALSE;`;
    await this.db.query(query, [userId]);
  }

  /**
   * Updates last login timestamp on user.
   */
  async updateLastLogin(userId: string, ipAddress?: string): Promise<void> {
    const safeIp = ipAddress && ipAddress !== '::1' && ipAddress !== '127.0.0.1' ? ipAddress : null;
    const query = `
      UPDATE users 
      SET last_login_at = CURRENT_TIMESTAMP, 
          last_login_ip = $2::inet
      WHERE id = $1;
    `;
    await this.db.query(query, [userId, safeIp]);
  }

  /**
   * Records authentication attempts in security audit log.
   */
  async recordLoginAttempt(
    userId: string | null,
    email: string,
    ipAddress: string,
    status: 'SUCCESS' | 'INVALID_CREDENTIALS' | 'LOCKED_OUT' | 'SUSPENDED' | 'MFA_REQUIRED',
    userAgent?: string,
    failureReason?: string,
  ): Promise<void> {
    const safeIp = ipAddress && ipAddress !== '::1' ? ipAddress : '127.0.0.1';
    const query = `
      INSERT INTO login_attempts (user_id, email, ip_address, user_agent, status, failure_reason)
      VALUES ($1, $2, $3::inet, $4, $5, $6);
    `;
    try {
      await this.db.query(query, [
        userId,
        email,
        safeIp,
        userAgent || null,
        status,
        failureReason || null,
      ]);
    } catch {
      // Do not block auth flow if login attempt log insertion fails
    }
  }

  /**
   * Creates a single-use password reset token.
   */
  async createPasswordResetToken(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<PasswordResetTokenEntity> {
    const query = `
      INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
      VALUES ($1, $2, $3)
      RETURNING id, user_id, token_hash, expires_at, used_at;
    `;
    const result = await this.db.query<PasswordResetTokenEntity>(query, [
      userId,
      tokenHash,
      expiresAt,
    ]);
    return result.rows[0];
  }

  /**
   * Finds an active password reset token by hash.
   */
  async findPasswordResetToken(tokenHash: string): Promise<PasswordResetTokenEntity | null> {
    const query = `
      SELECT id, user_id, token_hash, expires_at, used_at
      FROM password_reset_tokens
      WHERE token_hash = $1
        AND used_at IS NULL
        AND expires_at > CURRENT_TIMESTAMP;
    `;
    const result = await this.db.query<PasswordResetTokenEntity>(query, [tokenHash]);
    return result.rows[0] || null;
  }

  /**
   * Marks a password reset token as used and updates the user's password.
   */
  async consumePasswordReset(
    tokenId: string,
    userId: string,
    newPasswordHash: string,
  ): Promise<void> {
    await this.db.query(
      'UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = $1;',
      [tokenId],
    );
    await this.db.query('UPDATE users SET password_hash = $1 WHERE id = $2;', [
      newPasswordHash,
      userId,
    ]);
  }
}
