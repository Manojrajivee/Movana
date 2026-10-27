import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { DatabaseService } from '../src/database/database.service';
import { RedisService } from '../src/redis/redis.service';
import { TransportFoundationRepository } from '../src/transport-foundation/repositories/transport-foundation.repository';

describe('Transport Foundation (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  let operatorToken: string;
  let passengerToken: string;
  let driverToken: string;

  const operatorUserId = '11111111-1111-4111-a111-111111111111';
  const passengerUserId = '22222222-2222-4222-a222-222222222222';
  const driverUserId = '33333333-3333-4333-a333-333333333333';

  const calendarId = '44444444-4444-4444-a444-444444444444';
  const exceptionId = '55555555-5555-4555-a555-555555555555';

  const mockCalendar: any = {
    id: calendarId,
    calendar_name: 'Metro Feeder Regular Schedule 2026',
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    monday: true,
    tuesday: true,
    wednesday: true,
    thursday: true,
    friday: true,
    saturday: true,
    sunday: false,
    created_at: new Date(),
    updated_at: new Date(),
    exceptions_count: 1,
  };

  const mockException: any = {
    id: exceptionId,
    service_calendar_id: calendarId,
    exception_date: '2026-08-15',
    exception_type: 'REMOVED',
    description: 'Independence Day Holiday',
    created_at: new Date(),
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
    withTransaction: jest.fn().mockImplementation(async (callback) => {
      const client = { query: jest.fn().mockResolvedValue({ rows: [] }) };
      return callback(client);
    }),
  };

  const mockRedisService = {
    isAvailable: jest.fn().mockReturnValue(true),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
    delByPattern: jest.fn().mockResolvedValue(undefined),
    checkHealth: jest.fn().mockResolvedValue({
      status: 'up',
      latencyMs: 1,
      ping: 'PONG',
    }),
  };

  const mockTransportFoundationRepo = {
    createCalendar: jest.fn().mockResolvedValue(mockCalendar),
    findCalendarById: jest.fn().mockImplementation((id: string) => {
      if (id === calendarId) return Promise.resolve(mockCalendar);
      return Promise.resolve(null);
    }),
    findCalendars: jest.fn().mockResolvedValue({
      calendars: [mockCalendar],
      total: 1,
    }),
    updateCalendar: jest.fn().mockResolvedValue({
      ...mockCalendar,
      calendar_name: 'Updated Metro Feeder Schedule',
    }),
    deleteCalendar: jest.fn().mockResolvedValue(true),
    createException: jest.fn().mockResolvedValue(mockException),
    findExceptionsByCalendarId: jest.fn().mockResolvedValue([mockException]),
    findExceptionById: jest.fn().mockImplementation((id: string) => {
      if (id === exceptionId) return Promise.resolve(mockException);
      return Promise.resolve(null);
    }),
    findExceptionByCalendarAndDate: jest.fn().mockImplementation((_calId: string, date: string) => {
      if (date === '2026-08-15') return Promise.resolve(mockException);
      return Promise.resolve(null);
    }),
    deleteException: jest.fn().mockResolvedValue(true),
  };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.APP_PORT = '3000';
    process.env.DATABASE_NAME = 'movana';
    process.env.DATABASE_USER = 'movana_app';
    process.env.DATABASE_PASSWORD = 'MockTestPasswordSecret123!';
    process.env.REDIS_REQUIRED_FOR_READY = 'false';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useValue(mockDatabaseService)
      .overrideProvider(RedisService)
      .useValue(mockRedisService)
      .overrideProvider(TransportFoundationRepository)
      .useValue(mockTransportFoundationRepo)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    jwtService = moduleFixture.get<JwtService>(JwtService);

    operatorToken = jwtService.sign({
      sub: operatorUserId,
      email: 'operator@movana.internal',
      roles: ['OPERATOR'],
      permissions: ['*'],
    });

    driverToken = jwtService.sign({
      sub: driverUserId,
      email: 'driver@movana.internal',
      roles: ['DRIVER'],
      permissions: ['drivers:read'],
    });

    passengerToken = jwtService.sign({
      sub: passengerUserId,
      email: 'passenger@example.com',
      roles: ['PASSENGER'],
      permissions: [],
    });
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('Security & Access Controls', () => {
    it('should return 401 Unauthorized without token', async () => {
      await request(app.getHttpServer()).get('/api/v1/transport-foundation/calendars').expect(401);
    });

    it('should return 403 Forbidden when passenger attempts to create calendar', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/transport-foundation/calendars')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({
          calendarName: 'Unauthorized Calendar',
          startDate: '2026-01-01',
          endDate: '2026-12-31',
        })
        .expect(403);
    });

    it('should return 403 Forbidden when passenger attempts to create calendar exception', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/transport-foundation/calendars/${calendarId}/exceptions`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({
          exceptionDate: '2026-08-15',
          exceptionType: 'REMOVED',
        })
        .expect(403);
    });
  });

  describe('Service Calendar Lifecycle', () => {
    it('should create service calendar with 201 Created for OPERATOR', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/transport-foundation/calendars')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          calendarName: 'Metro Feeder Regular Schedule 2026',
          startDate: '2026-01-01',
          endDate: '2026-12-31',
          monday: true,
          tuesday: true,
          wednesday: true,
          thursday: true,
          friday: true,
          saturday: true,
          sunday: false,
        })
        .expect(201);

      expect(res.body.calendar_name).toBe('Metro Feeder Regular Schedule 2026');
      expect(res.body.id).toBe(calendarId);
    });

    it('should retrieve list of calendars with 200 OK for DRIVER', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/transport-foundation/calendars')
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(200);

      expect(res.body.calendars).toHaveLength(1);
      expect(res.body.total).toBe(1);
    });

    it('should retrieve calendar by ID with 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/transport-foundation/calendars/${calendarId}`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(200);

      expect(res.body.id).toBe(calendarId);
      expect(Array.isArray(res.body.exceptions)).toBe(true);
    });

    it('should update calendar with 200 OK for OPERATOR', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/transport-foundation/calendars/${calendarId}`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          calendarName: 'Updated Metro Feeder Schedule',
        })
        .expect(200);

      expect(res.body.calendar_name).toBe('Updated Metro Feeder Schedule');
    });

    it('should delete calendar with 200 OK for OPERATOR', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/transport-foundation/calendars/${calendarId}`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(200);

      expect(res.body.deleted).toBe(true);
    });
  });

  describe('Calendar Exceptions Management', () => {
    it('should add calendar exception with 201 Created for OPERATOR', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/transport-foundation/calendars/${calendarId}/exceptions`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          exceptionDate: '2026-10-02',
          exceptionType: 'REMOVED',
          description: 'Gandhi Jayanti',
        })
        .expect(201);

      expect(res.body.id).toBe(exceptionId);
      expect(res.body.exception_type).toBe('REMOVED');
    });

    it('should list calendar exceptions with 200 OK for DRIVER', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/transport-foundation/calendars/${calendarId}/exceptions`)
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body[0].id).toBe(exceptionId);
    });

    it('should delete calendar exception with 200 OK for OPERATOR', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/transport-foundation/calendars/${calendarId}/exceptions/${exceptionId}`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(200);

      expect(res.body.deleted).toBe(true);
    });
  });

  describe('Operational Network Inquiries', () => {
    it('should verify calendar activity check with 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/transport-foundation/calendars/${calendarId}/is-active-on`)
        .set('Authorization', `Bearer ${driverToken}`)
        .query({ date: '2026-08-15' })
        .expect(200);

      expect(res.body.calendarId).toBe(calendarId);
      expect(res.body.isActive).toBe(false);
      expect(res.body.hasException).toBe(true);
    });

    it('should return transit modes network definitions with 200 OK for PASSENGER', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/transport-foundation/transit-modes')
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.some((m: any) => m.mode === 'BUS')).toBe(true);
      expect(res.body.some((m: any) => m.mode === 'METRO')).toBe(true);
    });
  });
});
