import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';
import { CreateNotificationDto, NotificationChannel } from '../dto/create-notification.dto';
import { QueryNotificationsDto } from '../dto/query-notifications.dto';
import {
  EmailChannelAdapter,
  InAppChannelAdapter,
  NotificationChannelAdapter,
  PushChannelAdapter,
  SmsChannelAdapter,
} from '../adapters/notification-channel.adapter';
import {
  NotificationDeliveryEntity,
  NotificationEntity,
  NotificationsRepository,
} from '../repositories/notifications.repository';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly adapters: Map<NotificationChannel, NotificationChannelAdapter> = new Map();

  constructor(
    private readonly repository: NotificationsRepository,
    private readonly redisService: RedisService,
    private readonly inAppAdapter: InAppChannelAdapter,
    private readonly emailAdapter: EmailChannelAdapter,
    private readonly smsAdapter: SmsChannelAdapter,
    private readonly pushAdapter: PushChannelAdapter,
  ) {
    this.adapters.set('IN_APP', this.inAppAdapter);
    this.adapters.set('EMAIL', this.emailAdapter);
    this.adapters.set('SMS', this.smsAdapter);
    this.adapters.set('PUSH', this.pushAdapter);
  }

  async dispatch(
    dto: CreateNotificationDto,
    _currentUser?: any,
  ): Promise<{
    notification: NotificationEntity;
    delivery: NotificationDeliveryEntity | null;
    deduplicated?: boolean;
  }> {
    // 1. Idempotency Check via Redis
    if (dto.idempotencyKey) {
      const idempotencyKey = `movana:notifications:idempotency:${dto.idempotencyKey}`;
      const existingId = await this.redisService.get(idempotencyKey);
      if (existingId) {
        this.logger.warn(`Idempotent duplicate notification suppressed: key ${dto.idempotencyKey}`);
        const existingNotif = await this.repository.findNotificationById(existingId);
        if (existingNotif) {
          const deliveries = await this.repository.findDeliveriesByNotificationId(existingNotif.id);
          return {
            notification: existingNotif,
            delivery: deliveries[0] || null,
            deduplicated: true,
          };
        }
      }
    }

    // 2. Validate user exists
    const user = await this.repository.findUserById(dto.userId);
    if (!user) {
      throw new NotFoundException(`Recipient user '${dto.userId}' not found`);
    }

    // 3. Validate user preferences (consent / opt-out)
    const channel = dto.channel || 'IN_APP';
    const category = dto.category || 'SYSTEM';
    const isAllowed = await this.repository.isNotificationAllowedByPreference(
      dto.userId,
      channel,
      category,
    );
    if (!isAllowed) {
      this.logger.warn(
        `Notification suppressed by user preferences: user ${dto.userId}, channel ${channel}, category ${category}`,
      );
      throw new ConflictException(
        `Recipient user has opted out of ${channel} notifications for category '${category}'`,
      );
    }

    // 4. Resolve recipient address
    let recipient = dto.recipientAddress;
    if (!recipient) {
      if (channel === 'EMAIL') {
        recipient = user.email;
      } else if (channel === 'SMS') {
        recipient = user.phone || undefined;
      } else if (channel === 'IN_APP') {
        recipient = user.id;
      } else if (channel === 'PUSH') {
        recipient = dto.metadata?.deviceToken || `token-${user.id.substring(0, 8)}`;
      }
    }

    if (!recipient) {
      throw new BadRequestException(
        `No recipient contact address available for channel '${channel}'`,
      );
    }

    // 5. Create notification record in QUEUED state
    const notification = await this.repository.createNotification(
      {
        ...dto,
        channel,
        category,
      },
      'QUEUED',
    );

    // 6. Execute bounded transmission attempts with backoff
    const adapter = this.adapters.get(channel);
    if (!adapter) {
      throw new BadRequestException(`Unsupported notification channel: '${channel}'`);
    }

    let deliveryRecord: NotificationDeliveryEntity | null = null;
    let finalStatus: 'DELIVERED' | 'FAILED' = 'FAILED';
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const result = await adapter.send(
        {
          id: notification.id,
          userId: notification.user_id,
          title: notification.title,
          message: notification.message,
          channel: notification.channel,
          category: notification.category,
          metadata: notification.metadata,
        },
        recipient,
      );

      const deliveryStatus = result.success ? 'DELIVERED' : 'FAILED';
      deliveryRecord = await this.repository.createDeliveryAttempt({
        notificationId: notification.id,
        recipient,
        provider: result.provider,
        providerMessageId: result.providerMessageId || null,
        deliveryStatus,
        errorMessage: result.errorMessage || null,
        deliveredAt: result.success ? new Date().toISOString() : null,
      });

      if (result.success) {
        finalStatus = 'DELIVERED';
        break;
      }

      this.logger.warn(
        `Notification ${notification.id} attempt ${attempt} failed: ${result.errorMessage}. Retrying...`,
      );
      if (attempt < maxRetries) {
        // Linear backoff in tests/runtime
        await new Promise((resolve) => setTimeout(resolve, 50 * attempt));
      }
    }

    // 7. Update final notification status
    const updatedNotification = (await this.repository.updateNotificationStatus(
      notification.id,
      finalStatus,
      new Date().toISOString(),
      null,
    ))!;

    // 8. Cache idempotency key if provided (TTL: 24 hours)
    if (dto.idempotencyKey) {
      await this.redisService.set(
        `movana:notifications:idempotency:${dto.idempotencyKey}`,
        notification.id,
        86400,
      );
    }

    return {
      notification: updatedNotification,
      delivery: deliveryRecord,
    };
  }

  async getUserNotifications(
    userId: string,
    query: QueryNotificationsDto,
  ): Promise<{
    notifications: NotificationEntity[];
    total: number;
    unreadCount: number;
    limit: number;
    offset: number;
  }> {
    const result = await this.repository.findUserNotifications(userId, query);
    return {
      notifications: result.notifications,
      total: result.total,
      unreadCount: result.unreadCount,
      limit: query.limit || 20,
      offset: query.offset || 0,
    };
  }

  async getNotificationById(id: string, currentUser: any): Promise<NotificationEntity> {
    const notification = await this.repository.findNotificationById(id);
    if (!notification) {
      throw new NotFoundException(`Notification '${id}' not found`);
    }

    // Enforce ownership: user can only see own notifications unless admin/operator
    const isOwner = currentUser?.id === notification.user_id;
    const isStaff =
      currentUser?.roles?.includes('ADMIN') ||
      currentUser?.roles?.includes('OPERATOR') ||
      currentUser?.roles?.includes('SAFETY_OFFICER');

    if (!isOwner && !isStaff) {
      throw new ForbiddenException(
        `Access denied: cannot view notifications belonging to other users`,
      );
    }

    return notification;
  }

  async markAsRead(id: string, currentUser: any): Promise<NotificationEntity> {
    const notification = await this.getNotificationById(id, currentUser);
    if (notification.status === 'READ') {
      return notification;
    }

    const updated = await this.repository.markAsRead(id, currentUser.id);
    return updated || notification;
  }

  async markAllAsRead(currentUser: any): Promise<{ message: string; updatedCount: number }> {
    const updatedCount = await this.repository.markAllAsRead(currentUser.id);
    return {
      message: 'All notifications marked as read',
      updatedCount,
    };
  }

  async getUnreadCount(userId: string): Promise<{ unreadCount: number }> {
    const count = await this.repository.getUnreadCount(userId);
    return { unreadCount: count };
  }

  async retryNotification(
    id: string,
    currentUser: any,
  ): Promise<{ notification: NotificationEntity; delivery: NotificationDeliveryEntity }> {
    const isStaff =
      currentUser?.roles?.includes('ADMIN') || currentUser?.roles?.includes('OPERATOR');
    if (!isStaff) {
      throw new ForbiddenException(
        `Only ADMIN or OPERATOR can manually retry failed notifications`,
      );
    }

    const notification = await this.repository.findNotificationById(id);
    if (!notification) {
      throw new NotFoundException(`Notification '${id}' not found`);
    }

    if (notification.status === 'DELIVERED' || notification.status === 'READ') {
      throw new ConflictException(
        `Notification '${id}' is already ${notification.status} and does not require retry`,
      );
    }

    const user = await this.repository.findUserById(notification.user_id);
    let recipient =
      notification.channel === 'EMAIL'
        ? user?.email
        : notification.channel === 'SMS'
          ? user?.phone || undefined
          : user?.id;

    if (!recipient) {
      recipient = notification.user_id;
    }

    const adapter = this.adapters.get(notification.channel);
    if (!adapter) {
      throw new BadRequestException(`No adapter available for channel '${notification.channel}'`);
    }

    const result = await adapter.send(
      {
        id: notification.id,
        userId: notification.user_id,
        title: notification.title,
        message: notification.message,
        channel: notification.channel,
        category: notification.category,
        metadata: notification.metadata,
      },
      recipient,
    );

    const deliveryStatus = result.success ? 'DELIVERED' : 'FAILED';
    const delivery = await this.repository.createDeliveryAttempt({
      notificationId: notification.id,
      recipient,
      provider: result.provider,
      providerMessageId: result.providerMessageId || null,
      deliveryStatus,
      errorMessage: result.errorMessage || null,
      deliveredAt: result.success ? new Date().toISOString() : null,
    });

    const updated = (await this.repository.updateNotificationStatus(
      notification.id,
      result.success ? 'DELIVERED' : 'FAILED',
      new Date().toISOString(),
      null,
    ))!;

    return {
      notification: updated,
      delivery,
    };
  }

  async getDeliveryHistory(id: string, currentUser: any): Promise<NotificationDeliveryEntity[]> {
    // Validates permission via getNotificationById
    await this.getNotificationById(id, currentUser);
    return this.repository.findDeliveriesByNotificationId(id);
  }
}
