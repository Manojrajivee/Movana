import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { DatabaseService } from '../src/database/database.service';
import { NotificationsRepository } from '../src/notifications/repositories/notifications.repository';

describe('Notifications (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  let passengerToken: string;
  let otherPassengerToken: string;
  let operatorToken: string;
  let adminToken: string;

  const userId = '11111111-1111-4111-a111-111111111111';
  const otherUserId = '22222222-2222-4222-a222-222222222222';
  const notifId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';

  const mockUser = {
    id: userId,
    email: 'passenger@movana.internal',
    phone: '+919876543210',
    status: 'ACTIVE',
  };

  const mockNotification = {
    id: notifId,
    user_id: userId,
    title: 'Trip Delay Advisory',
    message: 'Bus #102 is delayed by 10 minutes.',
    channel: 'IN_APP',
    category: 'DELAY_ALERT',
    status: 'DELIVERED',
    metadata: { tripId: 'trip-1' },
    scheduled_for: new Date().toISOString(),
    sent_at: new Date().toISOString(),
    read_at: null,
    created_at: new Date().toISOString(),
  };

  const mockDelivery = {
    id: 'deliv-1111-1111-1111-111111111111',
    notification_id: notifId,
    recipient: userId,
    provider: 'INTERNAL_INBOX',
    provider_message_id: `inapp-${notifId}`,
    delivery_status: 'DELIVERED',
    error_message: null,
    attempted_at: new Date().toISOString(),
    delivered_at: new Date().toISOString(),
  };

  const mockDatabaseService = {
    verifyIdentity: jest.fn().mockResolvedValue({
      database_name: 'movana',
      database_user: 'movana_app',
    }),
    checkHealth: jest.fn().mockResolvedValue({
      status: 'up',
      latencyMs: 1,
      database: 'movana',
      user: 'movana_app',
    }),
    query: jest.fn().mockResolvedValue({ rows: [] }),
  };

  const mockNotificationsRepo = {
    createNotification: jest.fn().mockResolvedValue(mockNotification),
    findNotificationById: jest.fn().mockImplementation((id: string) => {
      if (id === notifId) return Promise.resolve(mockNotification);
      return Promise.resolve(null);
    }),
    findUserNotifications: jest.fn().mockResolvedValue({
      notifications: [mockNotification],
      total: 1,
      unreadCount: 1,
    }),
    updateNotificationStatus: jest.fn().mockResolvedValue(mockNotification),
    markAsRead: jest.fn().mockResolvedValue({
      ...mockNotification,
      status: 'READ',
      read_at: new Date().toISOString(),
    }),
    markAllAsRead: jest.fn().mockResolvedValue(1),
    getUnreadCount: jest.fn().mockResolvedValue(1),
    createDeliveryAttempt: jest.fn().mockResolvedValue(mockDelivery),
    findDeliveriesByNotificationId: jest.fn().mockResolvedValue([mockDelivery]),
    findUserById: jest.fn().mockImplementation((id: string) => {
      if (id === userId) return Promise.resolve(mockUser);
      return Promise.resolve(null);
    }),
    isNotificationAllowedByPreference: jest.fn().mockResolvedValue(true),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useValue(mockDatabaseService)
      .overrideProvider(NotificationsRepository)
      .useValue(mockNotificationsRepo)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    jwtService = moduleFixture.get<JwtService>(JwtService);

    passengerToken = jwtService.sign({
      sub: userId,
      email: 'passenger@movana.internal',
      roles: ['PASSENGER'],
    });

    otherPassengerToken = jwtService.sign({
      sub: otherUserId,
      email: 'other@movana.internal',
      roles: ['PASSENGER'],
    });

    operatorToken = jwtService.sign({
      sub: '33333333-3333-4333-a333-333333333333',
      email: 'operator@movana.internal',
      roles: ['OPERATOR'],
    });

    adminToken = jwtService.sign({
      sub: '44444444-4444-4444-a444-444444444444',
      email: 'admin@movana.internal',
      roles: ['ADMIN'],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/v1/notifications', () => {
    it('should reject unauthenticated dispatch with 401', async () => {
      const res = await request(app.getHttpServer()).post('/api/v1/notifications');
      expect(res.status).toBe(401);
    });

    it('should reject passenger dispatch with 403 Forbidden', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/notifications')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({
          userId,
          title: 'Unauthorized Notification',
          message: 'Trying to broadcast',
        });
      expect(res.status).toBe(403);
    });

    it('should reject invalid payload with 400 Bad Request', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/notifications')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      expect(res.status).toBe(400);
    });

    it('should allow ADMIN to dispatch notification with 201 Created', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/notifications')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          userId,
          title: 'Trip Delay Advisory',
          message: 'Bus #102 is delayed by 10 minutes.',
          channel: 'IN_APP',
          category: 'DELAY_ALERT',
        });

      expect(res.status).toBe(201);
      expect(res.body.notification.id).toBe(notifId);
      expect(res.body.notification.status).toBe('DELIVERED');
    });
  });

  describe('GET /api/v1/notifications/me', () => {
    it('should return passenger inbox with 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/notifications/me')
        .set('Authorization', `Bearer ${passengerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.notifications).toBeInstanceOf(Array);
      expect(res.body.unreadCount).toBe(1);
    });
  });

  describe('GET /api/v1/notifications/me/unread-count', () => {
    it('should return unread badge count with 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/notifications/me/unread-count')
        .set('Authorization', `Bearer ${passengerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.unreadCount).toBe(1);
    });
  });

  describe('PATCH /api/v1/notifications/:id/read', () => {
    it('should mark passenger notification as read with 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/notifications/${notifId}/read`)
        .set('Authorization', `Bearer ${passengerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('READ');
    });
  });

  describe('POST /api/v1/notifications/me/read-all', () => {
    it('should mark all notifications as read with 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/notifications/me/read-all')
        .set('Authorization', `Bearer ${passengerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.updatedCount).toBe(1);
    });
  });

  describe('GET /api/v1/notifications/:id', () => {
    it('should return 404 for non-existent notification', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/notifications/00000000-0000-4000-a000-000000000000')
        .set('Authorization', `Bearer ${passengerToken}`);

      expect(res.status).toBe(404);
    });

    it('should return 403 Forbidden if non-owner passenger views notification', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/notifications/${notifId}`)
        .set('Authorization', `Bearer ${otherPassengerToken}`);

      expect(res.status).toBe(403);
    });

    it('should return 200 OK when owner passenger views notification', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/notifications/${notifId}`)
        .set('Authorization', `Bearer ${passengerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(notifId);
    });
  });

  describe('POST /api/v1/notifications/:id/retry', () => {
    it('should reject passenger retry with 403 Forbidden', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/notifications/${notifId}/retry`)
        .set('Authorization', `Bearer ${passengerToken}`);

      expect(res.status).toBe(403);
    });

    it('should allow OPERATOR to retry failed notification with 200 OK', async () => {
      mockNotificationsRepo.findNotificationById.mockResolvedValueOnce({
        ...mockNotification,
        status: 'FAILED',
      });
      mockNotificationsRepo.updateNotificationStatus.mockResolvedValueOnce({
        ...mockNotification,
        status: 'DELIVERED',
      });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/notifications/${notifId}/retry`)
        .set('Authorization', `Bearer ${operatorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.notification.status).toBe('DELIVERED');
    });
  });
});
