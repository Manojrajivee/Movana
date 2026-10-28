import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { DatabaseService } from '../src/database/database.service';
import { NotificationPreferencesRepository } from '../src/notification-preferences/repositories/notification-preferences.repository';

describe('Notification Preferences (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  let passengerToken: string;
  let adminToken: string;

  const userId = '11111111-1111-4111-a111-111111111111';

  const mockPrefRow = {
    id: 'pref-1111-1111-1111-111111111111',
    user_id: userId,
    channel: 'SMS',
    notification_category: 'PROMOTION',
    is_enabled: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const mockChannelRow = {
    id: 'chan-1111-1111-1111-111111111111',
    user_id: userId,
    sms_enabled: true,
    email_enabled: true,
    push_enabled: true,
    marketing_enabled: false,
    trip_updates_enabled: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
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

  const mockPreferencesRepo = {
    findPreferencesByUserId: jest.fn().mockResolvedValue([mockPrefRow]),
    upsertPreference: jest.fn().mockResolvedValue(mockPrefRow),
    findUserPreferencesRow: jest.fn().mockResolvedValue(mockChannelRow),
    upsertUserPreferencesRow: jest.fn().mockResolvedValue(mockChannelRow),
    deleteUserPreferences: jest.fn().mockResolvedValue(1),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useValue(mockDatabaseService)
      .overrideProvider(NotificationPreferencesRepository)
      .useValue(mockPreferencesRepo)
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

    adminToken = jwtService.sign({
      sub: '44444444-4444-4444-a444-444444444444',
      email: 'admin@movana.internal',
      roles: ['ADMIN'],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/v1/notification-preferences/me', () => {
    it('should reject unauthenticated request with 401', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/notification-preferences/me');
      expect(res.status).toBe(401);
    });

    it('should return passenger preferences profile with 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/notification-preferences/me')
        .set('Authorization', `Bearer ${passengerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.userId).toBe(userId);
      expect(res.body.channelSwitches.email).toBe(true);
      expect(res.body.categories).toBeInstanceOf(Array);
    });
  });

  describe('PATCH /api/v1/notification-preferences/me', () => {
    it('should reject invalid payload with 400 Bad Request', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/notification-preferences/me')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({ channel: 'INVALID_CHANNEL' });

      expect(res.status).toBe(400);
    });

    it('should update single preference with 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/notification-preferences/me')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({
          channel: 'SMS',
          category: 'PROMOTION',
          isEnabled: false,
        });

      expect(res.status).toBe(200);
      expect(res.body.is_enabled).toBe(false);
    });
  });

  describe('PUT /api/v1/notification-preferences/me/matrix', () => {
    it('should reject invalid timezone with 400 Bad Request', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/v1/notification-preferences/me/matrix')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({
          quietHours: {
            enabled: true,
            start: '22:00',
            end: '07:00',
            timezone: 'Invalid/City',
          },
        });

      expect(res.status).toBe(400);
    });

    it('should update preferences matrix and quiet hours with 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/v1/notification-preferences/me/matrix')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({
          preferences: [
            {
              channel: 'SMS',
              category: 'PROMOTION',
              isEnabled: false,
            },
          ],
          channelDefaults: {
            marketingEnabled: false,
          },
          quietHours: {
            enabled: true,
            start: '22:00',
            end: '07:00',
            timezone: 'Asia/Kolkata',
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.userId).toBe(userId);
    });
  });

  describe('POST /api/v1/notification-preferences/me/reset-defaults', () => {
    it('should reset user preferences to defaults with 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/notification-preferences/me/reset-defaults')
        .set('Authorization', `Bearer ${passengerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.channelSwitches.marketing).toBe(false);
    });
  });

  describe('GET /api/v1/notification-preferences/users/:userId', () => {
    it('should reject passenger access with 403 Forbidden', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/notification-preferences/users/${userId}`)
        .set('Authorization', `Bearer ${passengerToken}`);

      expect(res.status).toBe(403);
    });

    it('should allow ADMIN to inspect user preferences with 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/notification-preferences/users/${userId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.userId).toBe(userId);
    });
  });
});
