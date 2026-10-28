import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { DatabaseService } from '../src/database/database.service';
import { AlertRulesRepository } from '../src/alert-rules/repositories/alert-rules.repository';

describe('Alert Rules (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  let passengerToken: string;
  let otherPassengerToken: string;
  let adminToken: string;

  const userId = '11111111-1111-4111-a111-111111111111';
  const otherUserId = '22222222-2222-4222-a222-222222222222';
  const ruleId = 'rule-1111-1111-1111-111111111111';

  const mockRule = {
    id: ruleId,
    name: 'Office Delay Alert',
    eventType: 'TRIP_DELAY_DETECTED',
    scope: 'PERSONAL',
    conditions: { thresholdMinutes: 10 },
    channels: ['IN_APP'],
    targetUserId: userId,
    isActive: true,
    cooldownMinutes: 15,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
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

  const mockAlertRepo = {
    saveRule: jest.fn().mockImplementation((r) => Promise.resolve(r)),
    findRuleById: jest.fn().mockImplementation((id: string) => {
      if (id === ruleId) return Promise.resolve(mockRule);
      return Promise.resolve(null);
    }),
    findRulesByUserId: jest.fn().mockResolvedValue([mockRule]),
    findActiveRulesByEventType: jest.fn().mockResolvedValue([mockRule]),
    deleteRule: jest.fn().mockResolvedValue(true),
    isDeduplicated: jest.fn().mockResolvedValue(false),
    validateRouteExists: jest.fn().mockResolvedValue(true),
    validateStopExists: jest.fn().mockResolvedValue(true),
    validateGeofenceExists: jest.fn().mockResolvedValue(true),
    validateVehicleExists: jest.fn().mockResolvedValue(true),
    validateUserExists: jest.fn().mockResolvedValue(true),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useValue(mockDatabaseService)
      .overrideProvider(AlertRulesRepository)
      .useValue(mockAlertRepo)
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

    adminToken = jwtService.sign({
      sub: '44444444-4444-4444-a444-444444444444',
      email: 'admin@movana.internal',
      roles: ['ADMIN'],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/v1/alert-rules', () => {
    it('should reject unauthenticated request with 401', async () => {
      const res = await request(app.getHttpServer()).post('/api/v1/alert-rules');
      expect(res.status).toBe(401);
    });

    it('should reject passenger creating SYSTEM rule with 403 Forbidden', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/alert-rules')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({
          name: 'Global Fleet Alert',
          eventType: 'VEHICLE_SPEED_EXCEEDED',
          scope: 'SYSTEM',
          channels: ['IN_APP'],
        });

      expect(res.status).toBe(403);
    });

    it('should reject invalid payload with 400 Bad Request', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/alert-rules')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({});

      expect(res.status).toBe(400);
    });

    it('should create personal alert rule with 201 Created', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/alert-rules')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({
          name: 'Office Delay Alert',
          eventType: 'TRIP_DELAY_DETECTED',
          channels: ['IN_APP'],
          conditions: { thresholdMinutes: 10 },
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.name).toBe('Office Delay Alert');
    });
  });

  describe('GET /api/v1/alert-rules', () => {
    it('should return user alert rules with 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/alert-rules')
        .set('Authorization', `Bearer ${passengerToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toBeInstanceOf(Array);
      expect(res.body).toHaveLength(1);
    });
  });

  describe('GET /api/v1/alert-rules/:id', () => {
    it('should return 404 for non-existent rule', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/alert-rules/00000000-0000-4000-a000-000000000000')
        .set('Authorization', `Bearer ${passengerToken}`);

      expect(res.status).toBe(404);
    });

    it('should return 403 Forbidden if non-owner passenger views rule', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/alert-rules/${ruleId}`)
        .set('Authorization', `Bearer ${otherPassengerToken}`);

      expect(res.status).toBe(403);
    });

    it('should return 200 OK when owner passenger views rule', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/alert-rules/${ruleId}`)
        .set('Authorization', `Bearer ${passengerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(ruleId);
    });
  });

  describe('PATCH /api/v1/alert-rules/:id', () => {
    it('should update alert rule with 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/alert-rules/${ruleId}`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({ name: 'Renamed Alert' });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Renamed Alert');
    });
  });

  describe('PATCH /api/v1/alert-rules/:id/toggle', () => {
    it('should toggle rule active status with 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/alert-rules/${ruleId}/toggle`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({ isActive: false });

      expect(res.status).toBe(200);
      expect(res.body.isActive).toBe(false);
    });
  });

  describe('DELETE /api/v1/alert-rules/:id', () => {
    it('should delete alert rule with 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/alert-rules/${ruleId}`)
        .set('Authorization', `Bearer ${passengerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /api/v1/alert-rules/evaluate', () => {
    it('should reject passenger from evaluating events with 403 Forbidden', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/alert-rules/evaluate')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({
          eventType: 'TRIP_DELAY_DETECTED',
          eventPayload: { delayMinutes: 15 },
        });

      expect(res.status).toBe(403);
    });

    it('should allow ADMIN to evaluate events with 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/alert-rules/evaluate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          eventType: 'TRIP_DELAY_DETECTED',
          eventPayload: { delayMinutes: 15 },
        });

      expect(res.status).toBe(200);
      expect(res.body.evaluatedRulesCount).toBeDefined();
    });
  });
});
