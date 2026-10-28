import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { RedisService } from '../../redis/redis.service';
import {
  EmailChannelAdapter,
  InAppChannelAdapter,
  PushChannelAdapter,
  SmsChannelAdapter,
} from '../adapters/notification-channel.adapter';
import { NotificationsRepository } from '../repositories/notifications.repository';
import { NotificationsService } from '../services/notifications.service';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let repository: jest.Mocked<NotificationsRepository>;
  let redisService: jest.Mocked<RedisService>;
  let inAppAdapter: jest.Mocked<InAppChannelAdapter>;
  let emailAdapter: jest.Mocked<EmailChannelAdapter>;
  let smsAdapter: jest.Mocked<SmsChannelAdapter>;

  const mockUser = {
    id: '11111111-1111-1111-a111-111111111111',
    email: 'passenger@example.com',
    phone: '+919876543210',
    status: 'ACTIVE',
  };

  const mockNotification = {
    id: 'notif-1111-1111-1111-111111111111',
    user_id: mockUser.id,
    title: 'Trip Delayed',
    message: 'Your bus is delayed by 15 minutes due to traffic.',
    channel: 'IN_APP' as const,
    category: 'DELAY_ALERT',
    status: 'DELIVERED' as const,
    metadata: { tripId: 'trip-123' },
    scheduled_for: new Date().toISOString(),
    sent_at: new Date().toISOString(),
    read_at: null,
    created_at: new Date().toISOString(),
  };

  const mockDelivery = {
    id: 'deliv-1111-1111-1111-111111111111',
    notification_id: mockNotification.id,
    recipient: mockUser.id,
    provider: 'INTERNAL_INBOX',
    provider_message_id: 'inapp-notif-1111',
    delivery_status: 'DELIVERED',
    error_message: null,
    attempted_at: new Date().toISOString(),
    delivered_at: new Date().toISOString(),
  };

  beforeEach(async () => {
    const mockRepo = {
      createNotification: jest.fn(),
      findNotificationById: jest.fn(),
      findUserNotifications: jest.fn(),
      updateNotificationStatus: jest.fn(),
      markAsRead: jest.fn(),
      markAllAsRead: jest.fn(),
      getUnreadCount: jest.fn(),
      createDeliveryAttempt: jest.fn(),
      findDeliveriesByNotificationId: jest.fn(),
      findUserById: jest.fn(),
      isNotificationAllowedByPreference: jest.fn(),
    };

    const mockRedis = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    };

    const mockInApp = {
      channel: 'IN_APP',
      send: jest.fn().mockResolvedValue({
        success: true,
        provider: 'INTERNAL_INBOX',
        providerMessageId: 'inapp-msg-1',
      }),
    };

    const mockEmail = {
      channel: 'EMAIL',
      send: jest.fn().mockResolvedValue({
        success: true,
        provider: 'SMTP_GATEWAY',
        providerMessageId: 'email-msg-1',
      }),
    };

    const mockSms = {
      channel: 'SMS',
      send: jest.fn().mockResolvedValue({
        success: true,
        provider: 'SMS_GATEWAY',
        providerMessageId: 'sms-msg-1',
      }),
    };

    const mockPush = {
      channel: 'PUSH',
      send: jest.fn().mockResolvedValue({
        success: true,
        provider: 'FCM_GATEWAY',
        providerMessageId: 'push-msg-1',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: NotificationsRepository, useValue: mockRepo },
        { provide: RedisService, useValue: mockRedis },
        { provide: InAppChannelAdapter, useValue: mockInApp },
        { provide: EmailChannelAdapter, useValue: mockEmail },
        { provide: SmsChannelAdapter, useValue: mockSms },
        { provide: PushChannelAdapter, useValue: mockPush },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
    repository = module.get(NotificationsRepository);
    redisService = module.get(RedisService);
    inAppAdapter = module.get(InAppChannelAdapter);
    emailAdapter = module.get(EmailChannelAdapter);
    smsAdapter = module.get(SmsChannelAdapter);
  });

  describe('dispatch', () => {
    it('should successfully dispatch an in-app notification', async () => {
      repository.findUserById.mockResolvedValue(mockUser);
      repository.isNotificationAllowedByPreference.mockResolvedValue(true);
      repository.createNotification.mockResolvedValue({
        ...mockNotification,
        status: 'QUEUED',
      });
      repository.createDeliveryAttempt.mockResolvedValue(mockDelivery);
      repository.updateNotificationStatus.mockResolvedValue(mockNotification);

      const result = await service.dispatch({
        userId: mockUser.id,
        title: 'Trip Delayed',
        message: 'Your bus is delayed by 15 minutes due to traffic.',
        channel: 'IN_APP',
        category: 'DELAY_ALERT',
        metadata: { tripId: 'trip-123' },
      });

      expect(result.notification.status).toBe('DELIVERED');
      expect(result.delivery?.delivery_status).toBe('DELIVERED');
      expect(inAppAdapter.send).toHaveBeenCalled();
    });

    it('should dispatch an email notification using user profile email', async () => {
      repository.findUserById.mockResolvedValue(mockUser);
      repository.isNotificationAllowedByPreference.mockResolvedValue(true);
      repository.createNotification.mockResolvedValue({
        ...mockNotification,
        channel: 'EMAIL',
        status: 'QUEUED',
      });
      repository.createDeliveryAttempt.mockResolvedValue({
        ...mockDelivery,
        provider: 'SMTP_GATEWAY',
      });
      repository.updateNotificationStatus.mockResolvedValue({
        ...mockNotification,
        channel: 'EMAIL',
      });

      const result = await service.dispatch({
        userId: mockUser.id,
        title: 'Booking Confirmed',
        message: 'Your seat 4B has been confirmed.',
        channel: 'EMAIL',
        category: 'BOOKING_CONFIRMATION',
      });

      expect(result.notification.channel).toBe('EMAIL');
      expect(emailAdapter.send).toHaveBeenCalledWith(expect.anything(), mockUser.email);
    });

    it('should throw NotFoundException if recipient user does not exist', async () => {
      repository.findUserById.mockResolvedValue(null);

      await expect(
        service.dispatch({
          userId: '00000000-0000-0000-0000-000000000000',
          title: 'Alert',
          message: 'Test message',
          channel: 'IN_APP',
          category: 'SYSTEM',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException if user opted out via notification preferences', async () => {
      repository.findUserById.mockResolvedValue(mockUser);
      repository.isNotificationAllowedByPreference.mockResolvedValue(false);

      await expect(
        service.dispatch({
          userId: mockUser.id,
          title: 'Promo',
          message: 'Get 20% off',
          channel: 'SMS',
          category: 'PROMOTION',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should deduplicate notification if idempotencyKey is already cached', async () => {
      redisService.get.mockResolvedValue(mockNotification.id);
      repository.findNotificationById.mockResolvedValue(mockNotification);
      repository.findDeliveriesByNotificationId.mockResolvedValue([mockDelivery]);

      const result = await service.dispatch({
        userId: mockUser.id,
        title: 'Trip Delayed',
        message: 'Duplicate alert',
        channel: 'IN_APP',
        category: 'DELAY_ALERT',
        idempotencyKey: 'idemp-12345',
      });

      expect(result.deduplicated).toBe(true);
      expect(result.notification.id).toBe(mockNotification.id);
      expect(repository.createNotification).not.toHaveBeenCalled();
    });

    it('should handle bounded retries and mark FAILED when delivery adapter consistently fails', async () => {
      repository.findUserById.mockResolvedValue(mockUser);
      repository.isNotificationAllowedByPreference.mockResolvedValue(true);
      repository.createNotification.mockResolvedValue({
        ...mockNotification,
        channel: 'SMS',
        status: 'QUEUED',
      });
      smsAdapter.send.mockResolvedValue({
        success: false,
        provider: 'SMS_GATEWAY',
        errorMessage: 'Carrier gateway unavailable',
      });
      repository.createDeliveryAttempt.mockResolvedValue({
        ...mockDelivery,
        delivery_status: 'FAILED',
        error_message: 'Carrier gateway unavailable',
      });
      repository.updateNotificationStatus.mockResolvedValue({
        ...mockNotification,
        status: 'FAILED',
      });

      const result = await service.dispatch({
        userId: mockUser.id,
        title: 'SMS Alert',
        message: 'Test SMS',
        channel: 'SMS',
        category: 'SYSTEM',
      });

      expect(result.notification.status).toBe('FAILED');
      expect(smsAdapter.send).toHaveBeenCalledTimes(3); // 3 bounded retries
    });
  });

  describe('getUserNotifications', () => {
    it('should return paginated user notifications with unread count', async () => {
      repository.findUserNotifications.mockResolvedValue({
        notifications: [mockNotification],
        total: 1,
        unreadCount: 1,
      });

      const result = await service.getUserNotifications(mockUser.id, {
        limit: 10,
        offset: 0,
      });

      expect(result.notifications).toHaveLength(1);
      expect(result.unreadCount).toBe(1);
      expect(result.total).toBe(1);
    });
  });

  describe('getNotificationById and ownership', () => {
    it('should allow user to view their own notification', async () => {
      repository.findNotificationById.mockResolvedValue(mockNotification);

      const result = await service.getNotificationById(mockNotification.id, {
        id: mockUser.id,
        roles: ['PASSENGER'],
      });

      expect(result.id).toBe(mockNotification.id);
    });

    it('should allow ADMIN to view another user notification', async () => {
      repository.findNotificationById.mockResolvedValue(mockNotification);

      const result = await service.getNotificationById(mockNotification.id, {
        id: 'admin-user-id',
        roles: ['ADMIN'],
      });

      expect(result.id).toBe(mockNotification.id);
    });

    it('should deny non-owner passenger from viewing another user notification', async () => {
      repository.findNotificationById.mockResolvedValue(mockNotification);

      await expect(
        service.getNotificationById(mockNotification.id, {
          id: 'other-passenger-id',
          roles: ['PASSENGER'],
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('markAsRead and markAllAsRead', () => {
    it('should mark single unread notification as read', async () => {
      repository.findNotificationById.mockResolvedValue(mockNotification);
      repository.markAsRead.mockResolvedValue({
        ...mockNotification,
        status: 'READ',
        read_at: new Date().toISOString(),
      });

      const result = await service.markAsRead(mockNotification.id, {
        id: mockUser.id,
        roles: ['PASSENGER'],
      });

      expect(result.status).toBe('READ');
    });

    it('should mark all unread notifications as read', async () => {
      repository.markAllAsRead.mockResolvedValue(5);

      const result = await service.markAllAsRead({
        id: mockUser.id,
        roles: ['PASSENGER'],
      });

      expect(result.updatedCount).toBe(5);
    });
  });

  describe('retryNotification', () => {
    it('should allow OPERATOR to retry failed notification', async () => {
      const failedNotif = {
        ...mockNotification,
        status: 'FAILED' as const,
      };
      repository.findNotificationById.mockResolvedValue(failedNotif);
      repository.findUserById.mockResolvedValue(mockUser);
      repository.createDeliveryAttempt.mockResolvedValue(mockDelivery);
      repository.updateNotificationStatus.mockResolvedValue({
        ...failedNotif,
        status: 'DELIVERED',
      });

      const result = await service.retryNotification(failedNotif.id, {
        id: 'operator-id',
        roles: ['OPERATOR'],
      });

      expect(result.notification.status).toBe('DELIVERED');
    });

    it('should prevent retry if notification is already DELIVERED', async () => {
      repository.findNotificationById.mockResolvedValue(mockNotification);

      await expect(
        service.retryNotification(mockNotification.id, {
          id: 'operator-id',
          roles: ['OPERATOR'],
        }),
      ).rejects.toThrow(ConflictException);
    });
  });
});
