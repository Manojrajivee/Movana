import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { DatabaseService } from '../src/database/database.service';
import { StopArrivalsRepository } from '../src/stop-arrivals/repositories/stop-arrivals.repository';

describe('Stop Arrivals (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  let operatorToken: string;
  let driverToken: string;
  let passengerToken: string;

  const operatorUserId = '11111111-1111-4111-a111-111111111111';
  const driverUserId = '22222222-2222-4222-a222-222222222222';
  const passengerUserId = '33333333-3333-4333-a333-333333333333';

  const testTripId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
  const testStopId = 'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb';

  const mockTripData = {
    id: testTripId,
    trip_number: 'TRIP-DEL-JPR-201',
    route_code: 'DEL-JPR',
    route_name: 'Delhi to Jaipur',
    status: 'IN_TRANSIT',
  };

  const mockTripStopData = {
    id: 'ts-1',
    trip_id: testTripId,
    stop_id: testStopId,
    sequence_number: 1,
    scheduled_arrival_at: new Date('2026-10-28T08:00:00Z'),
    scheduled_departure_at: new Date('2026-10-28T08:10:00Z'),
    actual_arrival_at: new Date('2026-10-28T08:00:00Z'),
    actual_departure_at: null,
    delay_minutes: 0,
    status: 'ARRIVED',
    stop_code: 'ISBT-DEL',
    stop_name: 'Kashmere Gate ISBT',
    latitude: 28.6675,
    longitude: 77.2285,
    city: 'Delhi',
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
  };

  const mockStopArrivalsRepository = {
    findTripById: jest.fn().mockResolvedValue(mockTripData),
    findTripStop: jest.fn().mockResolvedValue(mockTripStopData),
    findAllTripStops: jest.fn().mockResolvedValue([mockTripStopData]),
    findStopById: jest.fn().mockResolvedValue({ id: testStopId, stop_name: 'Kashmere Gate' }),
    recordArrivalTransactional: jest.fn().mockResolvedValue(mockTripStopData),
    recordDepartureTransactional: jest.fn().mockResolvedValue({
      ...mockTripStopData,
      status: 'DEPARTED',
      actual_departure_at: new Date('2026-10-28T08:05:00Z'),
    }),
    recordSkipTransactional: jest.fn().mockResolvedValue({
      ...mockTripStopData,
      status: 'SKIPPED',
    }),
    findRecentStopArrivals: jest.fn().mockResolvedValue([
      {
        trip_stop_id: 'ts-1',
        trip_id: testTripId,
        trip_number: 'TRIP-DEL-JPR-201',
        route_code: 'DEL-JPR',
        route_name: 'Delhi to Jaipur',
        vehicle_code: 'BUS-DEL-101',
        sequence_number: 1,
        scheduled_arrival_at: new Date(),
        scheduled_departure_at: new Date(),
        actual_arrival_at: new Date(),
        actual_departure_at: null,
        delay_minutes: 0,
        status: 'ARRIVED',
      },
    ]),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useValue(mockDatabaseService)
      .overrideProvider(StopArrivalsRepository)
      .useValue(mockStopArrivalsRepository)
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
    await app.close();
  });

  describe('POST /api/v1/stop-arrivals/trips/:tripId/stops/:stopId/arrive', () => {
    it('should reject unauthenticated request with 401', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/stop-arrivals/trips/${testTripId}/stops/${testStopId}/arrive`)
        .expect(401);
    });

    it('should reject passenger with 403 Forbidden', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/stop-arrivals/trips/${testTripId}/stops/${testStopId}/arrive`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({})
        .expect(403);
    });

    it('should return 404 if trip not found', async () => {
      mockStopArrivalsRepository.findTripById.mockResolvedValueOnce(null);

      await request(app.getHttpServer())
        .post(
          `/api/v1/stop-arrivals/trips/00000000-0000-0000-0000-000000000000/stops/${testStopId}/arrive`,
        )
        .set('Authorization', `Bearer ${driverToken}`)
        .send({})
        .expect(404);
    });

    it('should record arrival successfully by driver with 200 OK', async () => {
      mockStopArrivalsRepository.findTripStop.mockResolvedValueOnce({
        ...mockTripStopData,
        status: 'PENDING',
      });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/stop-arrivals/trips/${testTripId}/stops/${testStopId}/arrive`)
        .set('Authorization', `Bearer ${driverToken}`)
        .send({ arrivedAt: '2026-10-28T08:00:00Z', notes: 'Platform 1' })
        .expect(200);

      expect(res.body.status).toBe('ARRIVED');
    });
  });

  describe('POST /api/v1/stop-arrivals/trips/:tripId/stops/:stopId/depart', () => {
    it('should reject passenger with 403 Forbidden', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/stop-arrivals/trips/${testTripId}/stops/${testStopId}/depart`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({})
        .expect(403);
    });

    it('should record departure successfully by driver with 200 OK', async () => {
      mockStopArrivalsRepository.findTripStop.mockResolvedValueOnce({
        ...mockTripStopData,
        status: 'ARRIVED',
        actual_arrival_at: new Date('2026-10-28T08:00:00Z'),
      });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/stop-arrivals/trips/${testTripId}/stops/${testStopId}/depart`)
        .set('Authorization', `Bearer ${driverToken}`)
        .send({ departedAt: '2026-10-28T08:05:00Z' })
        .expect(200);

      expect(res.body.status).toBe('DEPARTED');
    });
  });

  describe('POST /api/v1/stop-arrivals/trips/:tripId/stops/:stopId/skip', () => {
    it('should reject driver with 403 Forbidden (operator/admin only)', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/stop-arrivals/trips/${testTripId}/stops/${testStopId}/skip`)
        .set('Authorization', `Bearer ${driverToken}`)
        .send({ reason: 'Accident detour' })
        .expect(403);
    });

    it('should reject when reason is missing with 400 Bad Request', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/stop-arrivals/trips/${testTripId}/stops/${testStopId}/skip`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({})
        .expect(400);
    });

    it('should allow operator to skip stop with 200 OK', async () => {
      mockStopArrivalsRepository.findTripStop.mockResolvedValueOnce({
        ...mockTripStopData,
        status: 'PENDING',
      });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/stop-arrivals/trips/${testTripId}/stops/${testStopId}/skip`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({ reason: 'Road under repair' })
        .expect(200);

      expect(res.body.status).toBe('SKIPPED');
    });
  });

  describe('GET /api/v1/stop-arrivals/trips/:tripId/timeline', () => {
    it('should allow passenger to retrieve stop timeline with 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/stop-arrivals/trips/${testTripId}/timeline`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(200);

      expect(res.body.tripId).toBe(testTripId);
      expect(res.body.summary.totalStops).toBe(1);
      expect(Array.isArray(res.body.stops)).toBe(true);
    });
  });

  describe('GET /api/v1/stop-arrivals/stops/:stopId/recent', () => {
    it('should return recent stop arrivals with 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/stop-arrivals/stops/${testStopId}/recent`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .query({ hours: 4, limit: 10 })
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body[0].trip_number).toBe('TRIP-DEL-JPR-201');
    });
  });
});
