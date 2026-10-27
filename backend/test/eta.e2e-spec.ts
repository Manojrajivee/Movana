import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { DatabaseService } from '../src/database/database.service';
import { EtaRepository } from '../src/eta/repositories/eta.repository';

describe('ETA Engine (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  let operatorToken: string;
  let passengerToken: string;

  const operatorUserId = '11111111-1111-4111-a111-111111111111';
  const passengerUserId = '22222222-2222-4222-a222-222222222222';

  const testTripId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
  const testStopId = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';

  const mockTripData = {
    trip_id: testTripId,
    trip_number: 'TRIP-DEL-JPR-101',
    route_id: 'route-1',
    route_code: 'DEL-JPR',
    route_name: 'Delhi to Jaipur',
    vehicle_id: 'veh-1',
    vehicle_code: 'BUS-101',
    vehicle_lat: 28.6139,
    vehicle_lon: 77.209,
    trip_lat: 28.6139,
    trip_lon: 77.209,
    status: 'IN_TRANSIT',
    delay_minutes: 4,
    scheduled_departure_at: new Date(Date.now() - 30 * 60 * 1000),
    scheduled_arrival_at: new Date(Date.now() + 90 * 60 * 1000),
  };

  const mockStopsData = [
    {
      id: 'ts-1',
      trip_id: testTripId,
      stop_id: testStopId,
      sequence_number: 1,
      scheduled_arrival_at: new Date(Date.now() - 30 * 60 * 1000),
      scheduled_departure_at: new Date(Date.now() - 28 * 60 * 1000),
      actual_arrival_at: new Date(Date.now() - 30 * 60 * 1000),
      actual_departure_at: new Date(Date.now() - 28 * 60 * 1000),
      delay_minutes: 0,
      status: 'DEPARTED',
      stop_code: 'DEL-ISBT',
      stop_name: 'Delhi ISBT Kashmiri Gate',
      latitude: 28.6675,
      longitude: 77.2285,
    },
    {
      id: 'ts-2',
      trip_id: testTripId,
      stop_id: 'cccccccc-cccc-4ccc-cccc-cccccccccccc',
      sequence_number: 2,
      scheduled_arrival_at: new Date(Date.now() + 45 * 60 * 1000),
      scheduled_departure_at: new Date(Date.now() + 47 * 60 * 1000),
      actual_arrival_at: null,
      actual_departure_at: null,
      delay_minutes: 0,
      status: 'PENDING',
      stop_code: 'GUR-IFFCO',
      stop_name: 'Gurugram IFFCO Chowk',
      latitude: 28.472,
      longitude: 77.0725,
    },
  ];

  const mockApproachingTrips = [
    {
      trip_id: testTripId,
      trip_number: 'TRIP-DEL-JPR-101',
      route_code: 'DEL-JPR',
      route_name: 'Delhi to Jaipur',
      vehicle_code: 'BUS-101',
      sequence_number: 2,
      scheduled_arrival_at: new Date(Date.now() + 45 * 60 * 1000),
      trip_status: 'IN_TRANSIT',
      current_latitude: 28.6139,
      current_longitude: 77.209,
      stop_latitude: 28.472,
      stop_longitude: 77.0725,
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

  const mockEtaRepository = {
    findTripForEta: jest.fn().mockResolvedValue(mockTripData),
    findTripStopsForEta: jest.fn().mockResolvedValue(mockStopsData),
    findApproachingTripsForStop: jest.fn().mockResolvedValue(mockApproachingTrips),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useValue(mockDatabaseService)
      .overrideProvider(EtaRepository)
      .useValue(mockEtaRepository)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    jwtService = moduleFixture.get<JwtService>(JwtService);

    operatorToken = jwtService.sign({
      sub: operatorUserId,
      email: 'operator@movana.internal',
      roles: ['OPERATOR'],
      permissions: ['eta:read'],
    });

    passengerToken = jwtService.sign({
      sub: passengerUserId,
      email: 'passenger@movana.internal',
      roles: ['PASSENGER'],
      permissions: ['eta:read'],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/v1/eta/trips/:tripId', () => {
    it('should reject unauthenticated requests with 401', async () => {
      await request(app.getHttpServer()).get(`/api/v1/eta/trips/${testTripId}`).expect(401);
    });

    it('should reject invalid UUID with 400', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/eta/trips/invalid-uuid')
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(400);
    });

    it('should return 404 when trip is not found', async () => {
      mockEtaRepository.findTripForEta.mockResolvedValueOnce(null);

      const notFoundTripId = '99999999-9999-4999-a999-999999999999';
      await request(app.getHttpServer())
        .get(`/api/v1/eta/trips/${notFoundTripId}`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(404);
    });

    it('should return trip ETA predictions for passenger', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/eta/trips/${testTripId}`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('tripId', testTripId);
      expect(res.body).toHaveProperty('tripNumber', 'TRIP-DEL-JPR-101');
      expect(res.body).toHaveProperty('routeCode', 'DEL-JPR');
      expect(res.body).toHaveProperty('stopsEta');
      expect(Array.isArray(res.body.stopsEta)).toBe(true);
      expect(res.body.stopsEta).toHaveLength(2);

      // Check departed stop
      expect(res.body.stopsEta[0]).toHaveProperty('status', 'DEPARTED');
      expect(res.body.stopsEta[0]).toHaveProperty('remainingDistanceKm', 0);

      // Check pending stop
      expect(res.body.stopsEta[1]).toHaveProperty('status', 'PENDING');
      expect(res.body.stopsEta[1]).toHaveProperty('estimatedArrivalAt');
      expect(res.body.stopsEta[1]).toHaveProperty('statusIndicator');
    });

    it('should return trip ETA predictions for operator', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/eta/trips/${testTripId}`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(200);
    });
  });

  describe('GET /api/v1/eta/stops/:stopId', () => {
    it('should reject unauthenticated requests with 401', async () => {
      await request(app.getHttpServer()).get(`/api/v1/eta/stops/${testStopId}`).expect(401);
    });

    it('should reject invalid UUID with 400', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/eta/stops/not-a-valid-uuid')
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(400);
    });

    it('should return approaching trips ETA for a stop', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/eta/stops/${testStopId}`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toHaveProperty('tripId', testTripId);
      expect(res.body[0]).toHaveProperty('tripNumber', 'TRIP-DEL-JPR-101');
      expect(res.body[0]).toHaveProperty('estimatedArrivalAt');
      expect(res.body[0]).toHaveProperty('remainingDistanceKm');
      expect(res.body[0]).toHaveProperty('statusIndicator');
    });
  });
});
