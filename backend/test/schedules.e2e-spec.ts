import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { DatabaseService } from '../src/database/database.service';
import { RedisService } from '../src/redis/redis.service';
import { SchedulesRepository } from '../src/schedules/repositories/schedules.repository';

describe('Schedules (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  let operatorToken: string;
  let passengerToken: string;
  let driverToken: string;

  const operatorUserId = '11111111-1111-4111-a111-111111111111';
  const passengerUserId = '22222222-2222-4222-a222-222222222222';
  const driverUserId = '33333333-3333-4333-a333-333333333333';

  const scheduleId = '44444444-4444-4444-a444-444444444444';
  const routeId = '55555555-5555-4555-a555-555555555555';
  const serviceCalendarId = '66666666-6666-4666-a666-666666666666';
  const stopId = '77777777-7777-4777-a777-777777777777';

  const mockSchedule: any = {
    id: scheduleId,
    schedule_code: 'SCH-DEL-JPR-0800',
    route_id: routeId,
    service_calendar_id: serviceCalendarId,
    departure_time: '08:00:00',
    arrival_time: '14:00:00',
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const mockScheduleStop: any = {
    id: '88888888-8888-4888-a888-888888888888',
    schedule_id: scheduleId,
    stop_id: stopId,
    sequence_number: 1,
    scheduled_arrival_offset_minutes: 60,
    scheduled_departure_offset_minutes: 75,
    stop_name: 'Gurugram IFFCO Chowk',
    stop_code: 'GGN-IFFCO-01',
    city: 'Gurugram',
    created_at: new Date(),
    updated_at: new Date(),
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

  const mockSchedulesRepo = {
    createSchedule: jest.fn().mockResolvedValue(mockSchedule),
    findByCode: jest.fn().mockImplementation((code: string) => {
      if (code === 'SCH-DEL-JPR-0800') return Promise.resolve(mockSchedule);
      return Promise.resolve(null);
    }),
    findById: jest.fn().mockImplementation((id: string) => {
      if (id === scheduleId) return Promise.resolve(mockSchedule);
      return Promise.resolve(null);
    }),
    findAll: jest.fn().mockResolvedValue({
      items: [mockSchedule],
      total: 1,
    }),
    findScheduleSummary: jest.fn().mockResolvedValue({
      items: [
        {
          schedule_id: scheduleId,
          schedule_code: mockSchedule.schedule_code,
          route_code: 'DEL-JPR-01',
          route_name: 'Delhi to Jaipur High Speed',
          departure_time: '08:00:00',
          arrival_time: '14:00:00',
          is_active: true,
          operating_days: 'Mon, Tue, Wed, Thu, Fri',
          intermediate_stops_count: 1,
        },
      ],
      total: 1,
    }),
    updateSchedule: jest.fn().mockResolvedValue({
      ...mockSchedule,
      departure_time: '08:30:00',
    }),
    deactivateSchedule: jest.fn().mockResolvedValue({
      ...mockSchedule,
      is_active: false,
    }),
    checkRouteActive: jest.fn().mockImplementation((id: string) => {
      return Promise.resolve(id === routeId);
    }),
    checkCalendarExists: jest.fn().mockImplementation((id: string) => {
      return Promise.resolve(id === serviceCalendarId);
    }),
    checkStopExists: jest.fn().mockImplementation((id: string) => {
      return Promise.resolve(id === stopId);
    }),
    findRouteStopsForRoute: jest.fn().mockResolvedValue([
      {
        stop_id: stopId,
        sequence_number: 1,
        arrival_offset_minutes: 60,
        departure_offset_minutes: 75,
      },
    ]),
    findScheduleStops: jest.fn().mockResolvedValue([mockScheduleStop]),
    findScheduleStop: jest.fn().mockImplementation((sId: string, stId: string) => {
      if (sId === scheduleId && stId === stopId) return Promise.resolve(mockScheduleStop);
      return Promise.resolve(null);
    }),
    addScheduleStop: jest.fn().mockResolvedValue(mockScheduleStop),
    updateScheduleStop: jest.fn().mockResolvedValue({
      ...mockScheduleStop,
      scheduled_arrival_offset_minutes: 65,
      scheduled_departure_offset_minutes: 80,
    }),
    deleteScheduleStop: jest.fn().mockResolvedValue(mockScheduleStop),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useValue(mockDatabaseService)
      .overrideProvider(RedisService)
      .useValue(mockRedisService)
      .overrideProvider(SchedulesRepository)
      .useValue(mockSchedulesRepo)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    jwtService = app.get<JwtService>(JwtService);

    operatorToken = jwtService.sign({
      sub: operatorUserId,
      email: 'operator@movana.internal',
      roles: ['OPERATOR'],
    });

    driverToken = jwtService.sign({
      sub: driverUserId,
      email: 'driver@movana.internal',
      roles: ['DRIVER'],
    });

    passengerToken = jwtService.sign({
      sub: passengerUserId,
      email: 'passenger@movana.internal',
      roles: ['PASSENGER'],
    });
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('POST /api/v1/schedules', () => {
    it('creates trip schedule by OPERATOR (201)', async () => {
      const payload = {
        scheduleCode: 'SCH-NEW-01',
        routeId,
        serviceCalendarId,
        departureTime: '09:00:00',
        arrivalTime: '15:00:00',
      };

      const res = await request(app.getHttpServer())
        .post('/api/v1/schedules')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send(payload)
        .expect(201);

      expect(res.body.id).toBe(scheduleId);
      expect(mockSchedulesRepo.createSchedule).toHaveBeenCalled();
    });

    it('returns 400 Bad Request on invalid time format', async () => {
      const payload = {
        scheduleCode: 'SCH-BAD-TIME',
        routeId,
        serviceCalendarId,
        departureTime: '99:99:99',
        arrivalTime: '15:00:00',
      };

      await request(app.getHttpServer())
        .post('/api/v1/schedules')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send(payload)
        .expect(400);
    });

    it('returns 409 Conflict on duplicate scheduleCode', async () => {
      const payload = {
        scheduleCode: 'SCH-DEL-JPR-0800',
        routeId,
        serviceCalendarId,
        departureTime: '08:00:00',
        arrivalTime: '14:00:00',
      };

      await request(app.getHttpServer())
        .post('/api/v1/schedules')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send(payload)
        .expect(409);
    });

    it('returns 404 Not Found if route does not exist', async () => {
      const payload = {
        scheduleCode: 'SCH-DEL-JPR-9999',
        routeId: '99999999-9999-4999-a999-999999999999',
        serviceCalendarId,
        departureTime: '08:00:00',
        arrivalTime: '14:00:00',
      };

      await request(app.getHttpServer())
        .post('/api/v1/schedules')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send(payload)
        .expect(404);
    });

    it('returns 403 Forbidden for PASSENGER', async () => {
      const payload = {
        scheduleCode: 'SCH-UNAUTH',
        routeId,
        serviceCalendarId,
        departureTime: '08:00:00',
        arrivalTime: '14:00:00',
      };

      await request(app.getHttpServer())
        .post('/api/v1/schedules')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send(payload)
        .expect(403);
    });

    it('returns 401 Unauthorized without token', async () => {
      await request(app.getHttpServer()).post('/api/v1/schedules').send({}).expect(401);
    });
  });

  describe('GET /api/v1/schedules', () => {
    it('lists trip schedules for PASSENGER (200)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/schedules')
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(200);

      expect(res.body.items).toHaveLength(1);
      expect(res.body.total).toBe(1);
    });
  });

  describe('GET /api/v1/schedules/summary', () => {
    it('returns timetable summary view joined with route details (200)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/schedules/summary?routeCode=DEL-JPR&limit=10')
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(200);

      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].route_code).toBe('DEL-JPR-01');
      expect(mockSchedulesRepo.findScheduleSummary).toHaveBeenCalled();
    });
  });

  describe('GET /api/v1/schedules/:id', () => {
    it('gets schedule by ID with intermediate stops (200)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/schedules/${scheduleId}`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(200);

      expect(res.body.id).toBe(scheduleId);
      expect(res.body.stops).toHaveLength(1);
    });

    it('returns 404 for non-existent schedule', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/schedules/99999999-9999-4999-a999-999999999999')
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(404);
    });
  });

  describe('PATCH /api/v1/schedules/:id', () => {
    it('updates departure/arrival times by OPERATOR (200)', async () => {
      const payload = { departureTime: '08:30:00' };

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/schedules/${scheduleId}`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send(payload)
        .expect(200);

      expect(res.body.departure_time).toBe('08:30:00');
    });

    it('returns 403 Forbidden for PASSENGER', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/schedules/${scheduleId}`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({ departureTime: '08:30:00' })
        .expect(403);
    });
  });

  describe('DELETE /api/v1/schedules/:id', () => {
    it('returns 403 Forbidden for PASSENGER', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/schedules/${scheduleId}`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(403);
    });

    it('deactivates schedule by OPERATOR (200)', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/schedules/${scheduleId}`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(200);

      expect(res.body.is_active).toBe(false);
    });
  });

  describe('POST /api/v1/schedules/:id/stops', () => {
    it('adds intermediate stop offset by OPERATOR (201)', async () => {
      const newStopId = '99999999-8888-4888-a888-888888888888';
      (mockSchedulesRepo.checkStopExists as jest.Mock).mockResolvedValueOnce(true);
      (mockSchedulesRepo.findScheduleStop as jest.Mock).mockResolvedValueOnce(null);

      const payload = {
        stopId: newStopId,
        sequenceNumber: 2,
        scheduledArrivalOffsetMinutes: 120,
        scheduledDepartureOffsetMinutes: 130,
      };

      const res = await request(app.getHttpServer())
        .post(`/api/v1/schedules/${scheduleId}/stops`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send(payload)
        .expect(201);

      expect(res.body).toBeDefined();
    });

    it('returns 400 Bad Request if arrival offset > departure offset', async () => {
      const payload = {
        stopId,
        sequenceNumber: 2,
        scheduledArrivalOffsetMinutes: 140,
        scheduledDepartureOffsetMinutes: 130,
      };

      await request(app.getHttpServer())
        .post(`/api/v1/schedules/${scheduleId}/stops`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send(payload)
        .expect(400);
    });

    it('returns 403 Forbidden for DRIVER', async () => {
      const payload = {
        stopId,
        sequenceNumber: 2,
        scheduledArrivalOffsetMinutes: 120,
        scheduledDepartureOffsetMinutes: 130,
      };

      await request(app.getHttpServer())
        .post(`/api/v1/schedules/${scheduleId}/stops`)
        .set('Authorization', `Bearer ${driverToken}`)
        .send(payload)
        .expect(403);
    });
  });

  describe('GET /api/v1/schedules/:id/stops', () => {
    it('returns intermediate stops for schedule (200)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/schedules/${scheduleId}/stops`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(200);

      expect(res.body).toHaveLength(1);
    });
  });

  describe('PATCH /api/v1/schedules/:id/stops/:stopId', () => {
    it('updates intermediate stop offsets (200)', async () => {
      const payload = {
        scheduledArrivalOffsetMinutes: 65,
        scheduledDepartureOffsetMinutes: 80,
      };

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/schedules/${scheduleId}/stops/${stopId}`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send(payload)
        .expect(200);

      expect(res.body.scheduled_arrival_offset_minutes).toBe(65);
    });

    it('returns 400 Bad Request if departure offset < arrival offset', async () => {
      const payload = {
        scheduledArrivalOffsetMinutes: 90,
        scheduledDepartureOffsetMinutes: 80,
      };

      await request(app.getHttpServer())
        .patch(`/api/v1/schedules/${scheduleId}/stops/${stopId}`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send(payload)
        .expect(400);
    });
  });

  describe('DELETE /api/v1/schedules/:id/stops/:stopId', () => {
    it('returns 403 Forbidden for PASSENGER', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/schedules/${scheduleId}/stops/${stopId}`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(403);
    });

    it('removes intermediate stop by OPERATOR (200)', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/schedules/${scheduleId}/stops/${stopId}`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(200);

      expect(res.body).toBeDefined();
    });
  });
});
