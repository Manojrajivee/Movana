import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from '../services/notifications.service';

describe('NotificationsController', () => {
  let controller: NotificationsController;
  let service: jest.Mocked<NotificationsService>;

  const mockUser = {
    id: '11111111-1111-1111-a111-111111111111',
    roles: ['PASSENGER'],
  };

  const mockAdmin = {
    id: '22222222-2222-2222-a222-222222222222',
    roles: ['ADMIN'],
  };

  const mockNotification = {
    id: 'notif-1111-1111-1111-111111111111',
    user_id: mockUser.id,
    title: 'Trip Started',
    message: 'Bus #401 is on schedule.',
    channel: 'IN_APP' as const,
    category: 'TRIP_UPDATE',
    status: 'DELIVERED' as const,
    metadata: {},
    scheduled_for: new Date().toISOString(),
    sent_at: new Date().toISOString(),
    read_at: null,
    created_at: new Date().toISOString(),
  };

  beforeEach(async () => {
    const mockService = {
      dispatch: jest.fn(),
      getUserNotifications: jest.fn(),
      getMyUnreadCount: jest.fn(),
      getUnreadCount: jest.fn(),
      getNotificationById: jest.fn(),
      markAsRead: jest.fn(),
      markAllAsRead: jest.fn(),
      retryNotification: jest.fn(),
      getDeliveryHistory: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [{ provide: NotificationsService, useValue: mockService }],
    }).compile();

    controller = module.get<NotificationsController>(NotificationsController);
    service = module.get(NotificationsService);
  });

  it('should dispatch notification via service', async () => {
    service.dispatch.mockResolvedValue({
      notification: mockNotification,
      delivery: null,
    });

    const result = await controller.dispatchNotification(
      {
        userId: mockUser.id,
        title: 'Trip Started',
        message: 'Bus #401 is on schedule.',
        channel: 'IN_APP',
        category: 'TRIP_UPDATE',
      },
      mockAdmin,
    );

    expect(result.notification.id).toBe(mockNotification.id);
    expect(service.dispatch).toHaveBeenCalled();
  });

  it('should return current passenger notifications', async () => {
    service.getUserNotifications.mockResolvedValue({
      notifications: [mockNotification],
      total: 1,
      unreadCount: 1,
      limit: 20,
      offset: 0,
    });

    const result = await controller.getMyNotifications(mockUser, {
      limit: '20',
      offset: '0',
    });

    expect(result.notifications).toHaveLength(1);
    expect(service.getUserNotifications).toHaveBeenCalledWith(mockUser.id, expect.anything());
  });

  it('should return unread count for current user', async () => {
    service.getUnreadCount.mockResolvedValue({ unreadCount: 3 });

    const result = await controller.getMyUnreadCount(mockUser);
    expect(result.unreadCount).toBe(3);
  });

  it('should mark all notifications as read', async () => {
    service.markAllAsRead.mockResolvedValue({
      message: 'All notifications marked as read',
      updatedCount: 4,
    });

    const result = await controller.markAllAsRead(mockUser);
    expect(result.updatedCount).toBe(4);
  });

  it('should mark single notification as read', async () => {
    service.markAsRead.mockResolvedValue({
      ...mockNotification,
      status: 'READ',
      read_at: new Date().toISOString(),
    });

    const result = await controller.markAsRead(mockNotification.id, mockUser);
    expect(result.status).toBe('READ');
  });

  it('should get notification by id', async () => {
    service.getNotificationById.mockResolvedValue(mockNotification);

    const result = await controller.getNotificationById(mockNotification.id, mockUser);
    expect(result.id).toBe(mockNotification.id);
  });

  it('should retry failed notification', async () => {
    service.retryNotification.mockResolvedValue({
      notification: mockNotification,
      delivery: {
        id: 'deliv-1',
        notification_id: mockNotification.id,
        recipient: mockUser.id,
        provider: 'SMTP',
        provider_message_id: 'msg-1',
        delivery_status: 'DELIVERED',
        error_message: null,
        attempted_at: new Date().toISOString(),
        delivered_at: new Date().toISOString(),
      },
    });

    const result = await controller.retryNotification(mockNotification.id, mockAdmin);
    expect(result.notification.status).toBe('DELIVERED');
  });

  it('should get delivery attempts history', async () => {
    service.getDeliveryHistory.mockResolvedValue([]);

    const result = await controller.getDeliveryHistory(mockNotification.id, mockUser);
    expect(result).toEqual([]);
  });
});
