import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { DatabaseService } from '../src/database/database.service';
import { DelaysRepository } from '../src/delays/repositories/delays.repository';

describe('Delay Detection (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  let operatorToken: string;
  let passengerToken: string;

  const operatorUserId = '11111111-1111-4111-a111-111111111111';
  const passengerUserId = '22222222-2222-4222-a222-222222222222';

  const testTripId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';

  const mockTripData = {
    trip_id: testTripId,
    trip_number: 'TRIP-DEL-JPR-101',
    route_id: 'route-1',
    route_code: 'DEL-JPR',
    route_name: 'Delhi to Jaipur High Speed',
    vehicle_id: 'veh-1',
    vehicle_code: 'BUS-DEL-101',
    primary_driver_id: 'driver-1',
    status: 'IN_TRANSIT',
    delay_minutes: 0,
    scheduled_departure_at: new Date(Date.now() - 30 * 60 * 1000),
    scheduled_arrival_at: new Date(Date.now() + 90 * 60 * 1000),
    actual_departure_at: new Date(Date.now() - 30 * 60 * 1000),
    actual_arrival_at: null,
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

  const mockDelaysRepository = {
    findTripForDelay: jest.fn().mockResolvedValue(mockTripData),
    updateTripDelay: jest.fn().mockResolvedValue(mockTripData),
    recordTripEvent: jest.fn().mockResolvedValue(undefined),
    recordTripStatusHistory: jest.fn().mockResolvedValue(undefined),
    findActiveDelayedTrips: jest.fn().mockResolvedValue({
      items: [
        {
          trip_id: testTripId,
          trip_number: 'TRIP-DEL-JPR-101',
          route_id: 'route-1',
          route_code: 'DEL-JPR',
          route_name: 'Delhi to Jaipur High Speed',
          vehicle_id: 'veh-1',
          vehicle_code: 'BUS-DEL-101',
          status: 'DELAYED',
          delay_minutes: 15,
          scheduled_departure_at: new Date(),
          scheduled_arrival_at: new Date(),
          current_latitude: 28.6139,
          current_longitude: 77.209,
        },
      ],
      total: 1,
    }),
    getDelaySummary: jest.fn().mockResolvedValue({
      totalActiveTrips: 15,
      delayedTripsCount: 3,
      onTimeTripsCount: 12,
      onTimePerformanceRate: 80.0,
      averageDelayMinutes: 9.3,
      maxDelayMinutes: 25,
      topDelayedRoutes: [
        {
          route_id: 'route-1',
          route_code: 'DEL-JPR',
          route_name: 'Delhi to Jaipur',
          delayed_trips: 2,
          average_delay: 11.5,
        },
      ],
    }),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useValue(mockDatabaseService)
      .overrideProvider(DelaysRepository)
      .useValue(mockDelaysRepository)
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

  describe('POST /api/v1/delays/detect/:tripId', () => {
    it('should reject unauthenticated request with 401', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/delays/detect/${testTripId}`)
        .send({})
        .expect(401);
    });

    it('should reject unauthorized role PASSENGER with 403', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/delays/detect/${testTripId}`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({ thresholdMinutes: 5 })
        .expect(403);
    });

    it('should reject invalid UUID with 400', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/delays/detect/invalid-uuid')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({ thresholdMinutes: 5 })
        .expect(400);
    });

    it('should return 404 when trip is not found', async () => {
      mockDelaysRepository.findTripForDelay.mockResolvedValueOnce(null);

      const missingTripId = '99999999-9999-4999-a999-999999999999';
      await request(app.getHttpServer())
        .post(`/api/v1/delays/detect/${missingTripId}`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({ thresholdMinutes: 5 })
        .expect(404);
    });

    it('should detect trip delay for OPERATOR with 200', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/delays/detect/${testTripId}`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({ simulatedDelayMinutes: 14, thresholdMinutes: 5, reason: 'Traffic jam' })
        .expect(200);

      expect(res.body).toHaveProperty('tripId', testTripId);
      expect(res.body).toHaveProperty('isDelayed', true);
      expect(res.body).toHaveProperty('delayMinutes', 14);
      expect(res.body).toHaveProperty('status', 'DELAYED');
      expect(res.body).toHaveProperty('statusChanged', true);
    });
  });

  describe('GET /api/v1/delays/active', () => {
    it('should reject unauthenticated request with 401', async () => {
      await request(app.getHttpServer()).get('/api/v1/delays/active').expect(401);
    });

    it('should allow PASSENGER to retrieve active delayed trips with 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/delays/active?page=1&limit=10')
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('items');
      expect(Array.isArray(res.body.items)).toBe(true);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0]).toHaveProperty('trip_number', 'TRIP-DEL-JPR-101');
      expect(res.body).toHaveProperty('total', 1);
    });
  });

  describe('GET /api/v1/delays/summary', () => {
    it('should reject unauthenticated request with 401', async () => {
      await request(app.getHttpServer()).get('/api/v1/delays/summary').expect(401);
    });

    it('should reject unauthorized role PASSENGER with 403', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/delays/summary')
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(403);
    });

    it('should allow OPERATOR to retrieve delay summary with 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/delays/summary')
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('totalActiveTrips', 15);
      expect(res.body).toHaveProperty('delayedTripsCount', 3);
      expect(res.body).toHaveProperty('onTimePerformanceRate', 80.0);
      expect(res.body).toHaveProperty('topDelayedRoutes');
      expect(Array.isArray(res.body.topDelayedRoutes)).toBe(true);
    });
  });

  describe('POST /api/v1/delays/resolve/:tripId', () => {
    it('should reject unauthenticated request with 401', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/delays/resolve/${testTripId}`)
        .send({ resolutionNotes: 'Schedule recovered' })
        .expect(401);
    });

    it('should reject unauthorized role PASSENGER with 403', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/delays/resolve/${testTripId}`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({ resolutionNotes: 'Schedule recovered' })
        .expect(403);
    });

    it('should reject invalid payload with 400 when resolutionNotes is missing', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/delays/resolve/${testTripId}`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({ delayMinutes: 0 })
        .expect(400);
    });

    it('should allow OPERATOR to resolve trip delay with 200', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/delays/resolve/${testTripId}`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          resolutionNotes: 'Congestion cleared, vehicle back on schedule',
          delayMinutes: 0,
          newStatus: 'IN_TRANSIT',
        })
        .expect(200);

      expect(res.body).toHaveProperty('tripId', testTripId);
      expect(res.body).toHaveProperty('resolvedDelayMinutes', 0);
      expect(res.body).toHaveProperty('newStatus', 'IN_TRANSIT');
      expect(res.body).toHaveProperty(
        'resolutionNotes',
        'Congestion cleared, vehicle back on schedule',
      );
    });
  });
});
