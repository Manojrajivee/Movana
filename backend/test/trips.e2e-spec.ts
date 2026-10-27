import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { DatabaseService } from '../src/database/database.service';
import { TripsRepository } from '../src/trips/repositories/trips.repository';

describe('Trips (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  let operatorToken: string;
  let passengerToken: string;

  const operatorUserId = '11111111-1111-4111-a111-111111111111';
  const passengerUserId = '22222222-2222-4222-a222-222222222222';

  const testTripId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
  const testScheduleId = 'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb';
  const testRouteId = 'cccccccc-cccc-4ccc-accc-cccccccccccc';

  const mockTripData = {
    id: testTripId,
    trip_number: 'TRIP-DEL-JPR-201',
    route_id: testRouteId,
    schedule_id: testScheduleId,
    vehicle_id: 'veh-1',
    primary_driver_id: 'driver-1',
    secondary_driver_id: null,
    scheduled_departure_at: new Date('2026-10-28T08:00:00Z'),
    scheduled_arrival_at: new Date('2026-10-28T12:00:00Z'),
    actual_departure_at: null,
    actual_arrival_at: null,
    status: 'SCHEDULED',
    current_stop_id: null,
    current_latitude: null,
    current_longitude: null,
    delay_minutes: 0,
    created_at: new Date(),
    updated_at: new Date(),
    route_code: 'DEL-JPR',
    route_name: 'Delhi to Jaipur High Speed',
    stops_count: 3,
  };

  const mockTripStopsData = [
    {
      id: 'ts-1',
      trip_id: testTripId,
      stop_id: 'stop-1',
      sequence_number: 1,
      scheduled_arrival_at: new Date('2026-10-28T08:00:00Z'),
      scheduled_departure_at: new Date('2026-10-28T08:10:00Z'),
      actual_arrival_at: null,
      actual_departure_at: null,
      delay_minutes: 0,
      status: 'PENDING',
      stop_code: 'ISBT-KASHMERE',
      stop_name: 'Kashmere Gate ISBT',
    },
  ];

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

  const mockTripsRepository = {
    findTripById: jest.fn().mockResolvedValue(mockTripData),
    findTripByNumber: jest.fn().mockResolvedValue(null),
    findTripStops: jest.fn().mockResolvedValue(mockTripStopsData),
    findScheduleById: jest.fn().mockResolvedValue({
      id: testScheduleId,
      schedule_code: 'SCH-DEL-JPR-01',
      route_id: testRouteId,
      departure_time: '08:00:00',
      arrival_time: '12:00:00',
      is_active: true,
    }),
    findScheduleStops: jest.fn().mockResolvedValue([
      {
        stop_id: 'stop-1',
        sequence_number: 1,
        scheduled_arrival_offset_minutes: 0,
        scheduled_departure_offset_minutes: 10,
      },
    ]),
    findRouteById: jest.fn().mockResolvedValue({
      id: testRouteId,
      route_code: 'DEL-JPR',
      name: 'Delhi to Jaipur High Speed',
      status: 'ACTIVE',
    }),
    findRouteStops: jest.fn().mockResolvedValue([
      {
        stop_id: 'stop-1',
        sequence_number: 1,
        arrival_offset_minutes: 0,
        departure_offset_minutes: 10,
      },
    ]),
    findVehicleById: jest.fn().mockResolvedValue({
      id: 'veh-1',
      status: 'ACTIVE',
      registration_number: 'DL-01-A-1000',
    }),
    findDriverById: jest.fn().mockResolvedValue({
      id: 'driver-1',
      status: 'ACTIVE',
    }),
    queryTrips: jest.fn().mockResolvedValue({
      trips: [mockTripData],
      total: 1,
    }),
    createTripWithStops: jest.fn().mockResolvedValue(mockTripData),
    updateTrip: jest.fn().mockResolvedValue(mockTripData),
    cancelTrip: jest.fn().mockResolvedValue({
      ...mockTripData,
      status: 'CANCELLED',
    }),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useValue(mockDatabaseService)
      .overrideProvider(TripsRepository)
      .useValue(mockTripsRepository)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    jwtService = moduleFixture.get<JwtService>(JwtService);

    operatorToken = jwtService.sign({
      sub: operatorUserId,
      email: 'operator@movana.internal',
      roles: ['OPERATOR'],
    });

    passengerToken = jwtService.sign({
      sub: passengerUserId,
      email: 'passenger@movana.internal',
      roles: ['PASSENGER'],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/v1/trips/dispatch-schedule', () => {
    it('should reject unauthenticated request with 401', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/trips/dispatch-schedule')
        .send({
          scheduleId: testScheduleId,
          serviceDate: '2026-10-28',
        })
        .expect(401);
    });

    it('should reject passenger with 403 Forbidden', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/trips/dispatch-schedule')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({
          scheduleId: testScheduleId,
          serviceDate: '2026-10-28',
        })
        .expect(403);
    });

    it('should reject malformed payload with 400 Bad Request', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/trips/dispatch-schedule')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          scheduleId: 'not-a-uuid',
          serviceDate: 'invalid-date',
        })
        .expect(400);
    });

    it('should return 404 when schedule is not found', async () => {
      mockTripsRepository.findScheduleById.mockResolvedValueOnce(null);

      await request(app.getHttpServer())
        .post('/api/v1/trips/dispatch-schedule')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          scheduleId: testScheduleId,
          serviceDate: '2026-10-28',
        })
        .expect(404);
    });

    it('should successfully dispatch trip from schedule with 201 Created', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/trips/dispatch-schedule')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          scheduleId: testScheduleId,
          serviceDate: '2026-10-28',
          tripNumber: 'TRIP-DEL-JPR-201',
        })
        .expect(201);

      expect(res.body.trip).toBeDefined();
      expect(res.body.trip.id).toBe(testTripId);
      expect(res.body.stops).toHaveLength(1);
    });
  });

  describe('POST /api/v1/trips/ad-hoc', () => {
    it('should reject passenger with 403 Forbidden', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/trips/ad-hoc')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({
          routeId: testRouteId,
          scheduledDepartureAt: '2026-10-28T08:00:00Z',
          scheduledArrivalAt: '2026-10-28T12:00:00Z',
        })
        .expect(403);
    });

    it('should reject when arrival time is before departure time with 400', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/trips/ad-hoc')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          routeId: testRouteId,
          scheduledDepartureAt: '2026-10-28T12:00:00Z',
          scheduledArrivalAt: '2026-10-28T08:00:00Z',
        })
        .expect(400);
    });

    it('should create ad-hoc trip successfully with 201 Created', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/trips/ad-hoc')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          routeId: testRouteId,
          scheduledDepartureAt: '2026-10-28T08:00:00Z',
          scheduledArrivalAt: '2026-10-28T12:00:00Z',
          tripNumber: 'ADHOC-DEL-JPR-99',
        })
        .expect(201);

      expect(res.body.trip).toBeDefined();
    });
  });

  describe('GET /api/v1/trips', () => {
    it('should allow passenger to query trips with 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/trips')
        .set('Authorization', `Bearer ${passengerToken}`)
        .query({ page: 1, limit: 10, status: 'SCHEDULED' })
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.total).toBe(1);
      expect(res.body.page).toBe(1);
    });
  });

  describe('GET /api/v1/trips/:id', () => {
    it('should return 404 if trip not found', async () => {
      mockTripsRepository.findTripById.mockResolvedValueOnce(null);

      await request(app.getHttpServer())
        .get(`/api/v1/trips/00000000-0000-0000-0000-000000000000`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(404);
    });

    it('should return trip details and stops with 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/trips/${testTripId}`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(200);

      expect(res.body.trip.id).toBe(testTripId);
      expect(res.body.stops).toHaveLength(1);
    });
  });

  describe('GET /api/v1/trips/:id/stops', () => {
    it('should return stops timeline for trip with 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/trips/${testTripId}/stops`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body[0].stop_code).toBe('ISBT-KASHMERE');
    });
  });

  describe('PATCH /api/v1/trips/:id', () => {
    it('should reject passenger with 403 Forbidden', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/trips/${testTripId}`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({ vehicleId: 'veh-2' })
        .expect(403);
    });

    it('should update trip successfully by operator with 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/trips/${testTripId}`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          scheduledDepartureAt: '2026-10-28T08:30:00Z',
          scheduledArrivalAt: '2026-10-28T12:30:00Z',
        })
        .expect(200);

      expect(res.body.id).toBe(testTripId);
    });
  });

  describe('POST /api/v1/trips/:id/cancel', () => {
    it('should reject passenger with 403 Forbidden', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/trips/${testTripId}/cancel`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({ reason: 'Road accident' })
        .expect(403);
    });

    it('should reject when reason is omitted with 400 Bad Request', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/trips/${testTripId}/cancel`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({})
        .expect(400);
    });

    it('should cancel trip successfully with 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/trips/${testTripId}/cancel`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({ reason: 'Severe route disruption' })
        .expect(200);

      expect(res.body.status).toBe('CANCELLED');
    });
  });
});
