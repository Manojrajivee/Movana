import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { CreateNotificationDto, NotificationChannel } from '../dto/create-notification.dto';
import { NotificationStatus, QueryNotificationsDto } from '../dto/query-notifications.dto';

export interface NotificationEntity {
  id: string;
  user_id: string;
  title: string;
  message: string;
  channel: NotificationChannel;
  category: string;
  status: NotificationStatus;
  metadata: Record<string, any>;
  scheduled_for: string;
  sent_at: string | null;
  read_at: string | null;
  created_at: string;
}

export interface NotificationDeliveryEntity {
  id: string;
  notification_id: string;
  recipient: string;
  provider: string;
  provider_message_id: string | null;
  delivery_status: string;
  error_message: string | null;
  attempted_at: string;
  delivered_at: string | null;
}

export interface UserSummaryEntity {
  id: string;
  email: string;
  phone: string | null;
  status: string;
}

@Injectable()
export class NotificationsRepository {
  constructor(private readonly db: DatabaseService) {}

  async createNotification(
    dto: CreateNotificationDto,
    initialStatus: NotificationStatus = 'QUEUED',
  ): Promise<NotificationEntity> {
    const query = `
      INSERT INTO notifications (
        user_id,
        title,
        message,
        channel,
        category,
        status,
        metadata,
        scheduled_for,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP)
      RETURNING *;
    `;

    const params = [
      dto.userId,
      dto.title,
      dto.message,
      dto.channel,
      dto.category,
      initialStatus,
      JSON.stringify(dto.metadata || {}),
      dto.scheduledFor || null,
    ];

    const result = await this.db.query<NotificationEntity>(query, params);
    return result.rows[0];
  }

  async findNotificationById(id: string): Promise<NotificationEntity | null> {
    const query = `
      SELECT *
      FROM notifications
      WHERE id = $1;
    `;
    const result = await this.db.query<NotificationEntity>(query, [id]);
    return result.rows[0] || null;
  }

  async findUserNotifications(
    userId: string,
    queryDto: QueryNotificationsDto,
  ): Promise<{ notifications: NotificationEntity[]; total: number; unreadCount: number }> {
    const conditions: string[] = ['user_id = $1'];
    const params: any[] = [userId];
    let paramIndex = 2;

    if (queryDto.channel) {
      conditions.push(`channel = $${paramIndex++}`);
      params.push(queryDto.channel);
    }

    if (queryDto.category) {
      conditions.push(`category = $${paramIndex++}`);
      params.push(queryDto.category);
    }

    if (queryDto.status) {
      conditions.push(`status = $${paramIndex++}`);
      params.push(queryDto.status);
    }

    if (queryDto.unreadOnly) {
      conditions.push(`read_at IS NULL`);
    }

    const whereClause = conditions.join(' AND ');

    const countQuery = `
      SELECT COUNT(*)::int AS count
      FROM notifications
      WHERE ${whereClause};
    `;
    const countResult = await this.db.query<{ count: number }>(countQuery, params);
    const total = countResult.rows[0]?.count || 0;

    const unreadCountResult = await this.db.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND read_at IS NULL;`,
      [userId],
    );
    const unreadCount = unreadCountResult.rows[0]?.count || 0;

    const limit = queryDto.limit || 20;
    const offset = queryDto.offset || 0;

    const dataQuery = `
      SELECT *
      FROM notifications
      WHERE ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++};
    `;
    params.push(limit, offset);

    const dataResult = await this.db.query<NotificationEntity>(dataQuery, params);

    return {
      notifications: dataResult.rows,
      total,
      unreadCount,
    };
  }

  async updateNotificationStatus(
    id: string,
    status: NotificationStatus,
    sentAt: string | null = null,
    readAt: string | null = null,
  ): Promise<NotificationEntity | null> {
    const query = `
      UPDATE notifications
      SET status = $2,
          sent_at = COALESCE($3, sent_at),
          read_at = COALESCE($4, read_at)
      WHERE id = $1
      RETURNING *;
    `;
    const result = await this.db.query<NotificationEntity>(query, [id, status, sentAt, readAt]);
    return result.rows[0] || null;
  }

  async markAsRead(id: string, userId: string): Promise<NotificationEntity | null> {
    const query = `
      UPDATE notifications
      SET status = 'READ',
          read_at = CURRENT_TIMESTAMP
      WHERE id = $1
        AND user_id = $2
        AND read_at IS NULL
      RETURNING *;
    `;
    const result = await this.db.query<NotificationEntity>(query, [id, userId]);
    return result.rows[0] || null;
  }

  async markAllAsRead(userId: string): Promise<number> {
    const query = `
      UPDATE notifications
      SET status = 'READ',
          read_at = CURRENT_TIMESTAMP
      WHERE user_id = $1
        AND read_at IS NULL;
    `;
    const result = await this.db.query(query, [userId]);
    return result.rowCount || 0;
  }

  async getUnreadCount(userId: string): Promise<number> {
    const query = `
      SELECT COUNT(*)::int AS count
      FROM notifications
      WHERE user_id = $1
        AND read_at IS NULL;
    `;
    const result = await this.db.query<{ count: number }>(query, [userId]);
    return result.rows[0]?.count || 0;
  }

  async createDeliveryAttempt(data: {
    notificationId: string;
    recipient: string;
    provider: string;
    providerMessageId?: string | null;
    deliveryStatus: string;
    errorMessage?: string | null;
    attemptedAt?: string;
    deliveredAt?: string | null;
  }): Promise<NotificationDeliveryEntity> {
    const query = `
      INSERT INTO notification_deliveries (
        notification_id,
        recipient,
        provider,
        provider_message_id,
        delivery_status,
        error_message,
        attempted_at,
        delivered_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, CURRENT_TIMESTAMP), $8)
      RETURNING *;
    `;
    const params = [
      data.notificationId,
      data.recipient,
      data.provider,
      data.providerMessageId || null,
      data.deliveryStatus,
      data.errorMessage || null,
      data.attemptedAt || null,
      data.deliveredAt || null,
    ];
    const result = await this.db.query<NotificationDeliveryEntity>(query, params);
    return result.rows[0];
  }

  async findDeliveriesByNotificationId(
    notificationId: string,
  ): Promise<NotificationDeliveryEntity[]> {
    const query = `
      SELECT *
      FROM notification_deliveries
      WHERE notification_id = $1
      ORDER BY attempted_at DESC;
    `;
    const result = await this.db.query<NotificationDeliveryEntity>(query, [notificationId]);
    return result.rows;
  }

  async findUserById(userId: string): Promise<UserSummaryEntity | null> {
    const query = `
      SELECT id, email, phone, status
      FROM users
      WHERE id = $1;
    `;
    const result = await this.db.query<UserSummaryEntity>(query, [userId]);
    return result.rows[0] || null;
  }

  async isNotificationAllowedByPreference(
    userId: string,
    channel: NotificationChannel,
    category: string,
  ): Promise<boolean> {
    const query = `
      SELECT is_enabled
      FROM notification_preferences
      WHERE user_id = $1
        AND channel = $2
        AND notification_category = $3;
    `;
    const result = await this.db.query<{ is_enabled: boolean }>(query, [userId, channel, category]);
    if (result.rows.length > 0) {
      return result.rows[0].is_enabled;
    }
    // Default: IN_APP is always allowed unless disabled, marketing defaults to false
    if (category === 'PROMOTION' || category === 'MARKETING') {
      return false;
    }
    return true;
  }
}
