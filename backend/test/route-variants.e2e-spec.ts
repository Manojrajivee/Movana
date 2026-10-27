import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { DatabaseService } from '../src/database/database.service';
import { RedisService } from '../src/redis/redis.service';
import { RouteVariantsRepository } from '../src/route-variants/repositories/route-variants.repository';

describe('Route Variants (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  let operatorToken: string;
  let passengerToken: string;
  let driverToken: string;

  const operatorUserId = '11111111-1111-4111-a111-111111111111';
  const passengerUserId = '22222222-2222-4222-a222-222222222222';
  const driverUserId = '33333333-3333-4333-a333-333333333333';

  const routeId = '44444444-4444-4444-a444-444444444444';
  const stop1Id = '55555555-5555-4555-a555-555555555555';
  const stop2Id = '66666666-6666-4666-a666-666666666666';
  const newStopId = '77777777-7777-4777-a777-777777777777';

  const mockRouteStop1: any = {
    id: '88888888-8888-4888-a888-888888888888',
    route_id: routeId,
    stop_id: stop1Id,
    sequence_number: 1,
    arrival_offset_minutes: 0,
    departure_offset_minutes: 5,
    distance_from_origin_km: 0.0,
    is_boarding_allowed: true,
    is_dropoff_allowed: false,
    created_at: new Date(),
    updated_at: new Date(),
    stop_code: 'STOP-01',
    stop_name: 'Origin Terminal',
    stop_address: '101 Transport Hub',
    stop_city: 'New Delhi',
    latitude: 28.6139,
    longitude: 77.209,
  };

  const mockRouteStop2: any = {
    id: '99999999-9999-4999-a999-999999999999',
    route_id: routeId,
    stop_id: stop2Id,
    sequence_number: 2,
    arrival_offset_minutes: 20,
    departure_offset_minutes: 25,
    distance_from_origin_km: 12.0,
    is_boarding_allowed: true,
    is_dropoff_allowed: true,
    created_at: new Date(),
    updated_at: new Date(),
    stop_code: 'STOP-02',
    stop_name: 'Midway Station',
    stop_address: 'Central Avenue',
    stop_city: 'New Delhi',
    latitude: 28.58,
    longitude: 77.22,
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

  const mockRouteVariantsRepo = {
    addRouteStop: jest.fn().mockResolvedValue({
      ...mockRouteStop1,
      stop_id: newStopId,
      sequence_number: 3,
    }),
    findRouteStop: jest.fn().mockImplementation((rId: string, sId: string) => {
      if (rId === routeId && sId === stop1Id) return Promise.resolve(mockRouteStop1);
      if (rId === routeId && sId === stop2Id) return Promise.resolve(mockRouteStop2);
      return Promise.resolve(null);
    }),
    findBySequence: jest.fn().mockImplementation((rId: string, seq: number) => {
      if (rId === routeId && seq === 1) return Promise.resolve(mockRouteStop1);
      if (rId === routeId && seq === 2) return Promise.resolve(mockRouteStop2);
      return Promise.resolve(null);
    }),
    findStopsByRouteId: jest.fn().mockResolvedValue([mockRouteStop1, mockRouteStop2]),
    updateRouteStop: jest.fn().mockResolvedValue({
      ...mockRouteStop1,
      departure_offset_minutes: 10,
    }),
    deleteRouteStop: jest.fn().mockResolvedValue(mockRouteStop1),
    updateStopSequence: jest.fn().mockResolvedValue(undefined),
    checkRouteExists: jest.fn().mockImplementation((id: string) => {
      return Promise.resolve(id === routeId);
    }),
    checkStopExists: jest.fn().mockImplementation((id: string) => {
      return Promise.resolve(id === stop1Id || id === stop2Id || id === newStopId);
    }),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useValue(mockDatabaseService)
      .overrideProvider(RedisService)
      .useValue(mockRedisService)
      .overrideProvider(RouteVariantsRepository)
      .useValue(mockRouteVariantsRepo)
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

  describe('POST /api/v1/routes/:routeId/stops', () => {
    it('adds a stop to route sequence by OPERATOR (201)', async () => {
      mockRouteVariantsRepo.findBySequence.mockResolvedValueOnce(null);
      mockRouteVariantsRepo.findRouteStop.mockResolvedValueOnce(null);

      const payload = {
        stopId: newStopId,
        sequenceNumber: 3,
        arrivalOffsetMinutes: 30,
        departureOffsetMinutes: 35,
        distanceFromOriginKm: 18.0,
      };

      const res = await request(app.getHttpServer())
        .post(`/api/v1/routes/${routeId}/stops`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send(payload)
        .expect(201);

      expect(res.body.stop_id).toBe(newStopId);
      expect(mockRouteVariantsRepo.addRouteStop).toHaveBeenCalled();
    });

    it('returns 400 Bad Request if departureOffset < arrivalOffset', async () => {
      const payload = {
        stopId: newStopId,
        sequenceNumber: 3,
        arrivalOffsetMinutes: 40,
        departureOffsetMinutes: 35, // less than arrival
      };

      await request(app.getHttpServer())
        .post(`/api/v1/routes/${routeId}/stops`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send(payload)
        .expect(400);
    });

    it('returns 409 Conflict if stop already in route alignment', async () => {
      const payload = {
        stopId: stop1Id,
        sequenceNumber: 4,
      };

      await request(app.getHttpServer())
        .post(`/api/v1/routes/${routeId}/stops`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send(payload)
        .expect(409);
    });

    it('returns 409 Conflict if sequence number already taken', async () => {
      mockRouteVariantsRepo.findRouteStop.mockResolvedValueOnce(null);

      const payload = {
        stopId: newStopId,
        sequenceNumber: 1, // already taken by stop1
      };

      await request(app.getHttpServer())
        .post(`/api/v1/routes/${routeId}/stops`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send(payload)
        .expect(409);
    });

    it('returns 403 Forbidden for PASSENGER', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/routes/${routeId}/stops`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({ stopId: newStopId, sequenceNumber: 3 })
        .expect(403);
    });
  });

  describe('GET /api/v1/routes/:routeId/stops', () => {
    it('returns ordered stop sequence for route (200)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/routes/${routeId}/stops`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(200);

      expect(res.body).toHaveLength(2);
      expect(res.body[0].sequence_number).toBe(1);
      expect(res.body[1].sequence_number).toBe(2);
    });

    it('returns 404 Not Found if route does not exist', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/routes/00000000-0000-0000-0000-000000000000/stops')
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(404);
    });
  });

  describe('GET /api/v1/routes/:routeId/stops/alignment-summary', () => {
    it('returns alignment statistical overview (200)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/routes/${routeId}/stops/alignment-summary`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(200);

      expect(res.body.routeId).toBe(routeId);
      expect(res.body.totalStops).toBe(2);
      expect(res.body.maxDistanceFromOriginKm).toBe(12.0);
      expect(res.body.totalDurationOffsetMinutes).toBe(25);
    });
  });

  describe('POST /api/v1/routes/:routeId/stops/reorder', () => {
    it('reorders sequence numbers by OPERATOR (200)', async () => {
      const payload = {
        stops: [
          { stopId: stop2Id, sequenceNumber: 1 },
          { stopId: stop1Id, sequenceNumber: 2 },
        ],
      };

      const res = await request(app.getHttpServer())
        .post(`/api/v1/routes/${routeId}/stops/reorder`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send(payload)
        .expect(200);

      expect(res.body).toHaveLength(2);
    });

    it('returns 400 Bad Request on duplicate sequence numbers', async () => {
      const payload = {
        stops: [
          { stopId: stop1Id, sequenceNumber: 1 },
          { stopId: stop2Id, sequenceNumber: 1 }, // duplicate sequence
        ],
      };

      await request(app.getHttpServer())
        .post(`/api/v1/routes/${routeId}/stops/reorder`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send(payload)
        .expect(400);
    });

    it('returns 403 Forbidden for PASSENGER', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/routes/${routeId}/stops/reorder`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({ stops: [{ stopId: stop1Id, sequenceNumber: 1 }] })
        .expect(403);
    });
  });

  describe('GET /api/v1/routes/:routeId/stops/:stopId', () => {
    it('returns route stop details (200)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/routes/${routeId}/stops/${stop1Id}`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(200);

      expect(res.body.stop_id).toBe(stop1Id);
      expect(res.body.stop_code).toBe('STOP-01');
    });

    it('returns 404 Not Found if stop not on route', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/routes/${routeId}/stops/00000000-0000-0000-0000-000000000000`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(404);
    });
  });

  describe('PATCH /api/v1/routes/:routeId/stops/:stopId', () => {
    it('updates stop timing offsets by OPERATOR (200)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/routes/${routeId}/stops/${stop1Id}`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({ departureOffsetMinutes: 10 })
        .expect(200);

      expect(res.body.departure_offset_minutes).toBe(10);
    });
  });

  describe('DELETE /api/v1/routes/:routeId/stops/:stopId', () => {
    it('removes stop from sequence by OPERATOR (200)', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/routes/${routeId}/stops/${stop1Id}`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(200);

      expect(res.body.stop_id).toBe(stop1Id);
    });

    it('returns 403 Forbidden for DRIVER', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/routes/${routeId}/stops/${stop1Id}`)
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(403);
    });
  });
});
