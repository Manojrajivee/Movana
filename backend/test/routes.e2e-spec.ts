import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { DatabaseService } from '../src/database/database.service';
import { RedisService } from '../src/redis/redis.service';
import { RoutesRepository } from '../src/routes/repositories/routes.repository';

describe('Routes (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  let operatorToken: string;
  let passengerToken: string;
  let driverToken: string;

  const operatorUserId = '11111111-1111-4111-a111-111111111111';
  const passengerUserId = '22222222-2222-4222-a222-222222222222';
  const driverUserId = '33333333-3333-4333-a333-333333333333';

  const routeId = '44444444-4444-4444-a444-444444444444';
  const originStopId = '55555555-5555-4555-a555-555555555555';
  const destinationStopId = '66666666-6666-4666-a666-666666666666';

  const mockOriginStop = {
    id: originStopId,
    stop_code: 'STOP-DEL-01',
    name: 'Kashmere Gate ISBT',
    city: 'New Delhi',
    status: 'ACTIVE',
  };

  const mockDestinationStop = {
    id: destinationStopId,
    stop_code: 'STOP-DEL-02',
    name: 'IGI Airport Terminal 3',
    city: 'New Delhi',
    status: 'ACTIVE',
  };

  const mockRoute: any = {
    id: routeId,
    route_code: 'EXP-101',
    name: 'Airport Express Direct',
    description: 'Direct non-stop service',
    origin_stop_id: originStopId,
    destination_stop_id: destinationStopId,
    distance_km: 26.5,
    estimated_duration_minutes: 40,
    status: 'ACTIVE',
    created_at: new Date(),
    updated_at: new Date(),
    deleted_at: null,
    origin_stop_name: mockOriginStop.name,
    origin_stop_city: mockOriginStop.city,
    destination_stop_name: mockDestinationStop.name,
    destination_stop_city: mockDestinationStop.city,
    current_version_number: 1,
  };

  const mockVersion: any = {
    id: '77777777-7777-4777-a777-777777777777',
    route_id: routeId,
    version_number: 1,
    effective_from: '2026-01-01',
    effective_to: null,
    is_current: true,
    change_notes: 'Initial route topology creation',
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

  const mockRoutesRepo = {
    createRoute: jest.fn().mockResolvedValue(mockRoute),
    createRouteVersion: jest.fn().mockResolvedValue(mockVersion),
    findByCode: jest.fn().mockImplementation((code: string) => {
      if (code === 'EXP-101') return Promise.resolve(mockRoute);
      return Promise.resolve(null);
    }),
    findById: jest.fn().mockImplementation((id: string) => {
      if (id === routeId) return Promise.resolve(mockRoute);
      return Promise.resolve(null);
    }),
    findStopById: jest.fn().mockImplementation((id: string) => {
      if (id === originStopId) return Promise.resolve(mockOriginStop);
      if (id === destinationStopId) return Promise.resolve(mockDestinationStop);
      return Promise.resolve(null);
    }),
    findAll: jest.fn().mockResolvedValue({
      items: [mockRoute],
      total: 1,
    }),
    updateRoute: jest.fn().mockResolvedValue({
      ...mockRoute,
      name: 'Airport Express Direct (Revised)',
    }),
    updateRouteStatus: jest.fn().mockResolvedValue({
      ...mockRoute,
      status: 'SUSPENDED',
    }),
    softDelete: jest.fn().mockResolvedValue({
      ...mockRoute,
      deleted_at: new Date(),
      status: 'INACTIVE',
    }),
    findVersionsByRouteId: jest.fn().mockResolvedValue([mockVersion]),
    getLatestVersionNumber: jest.fn().mockResolvedValue(1),
    deprecatePreviousVersions: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useValue(mockDatabaseService)
      .overrideProvider(RedisService)
      .useValue(mockRedisService)
      .overrideProvider(RoutesRepository)
      .useValue(mockRoutesRepo)
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

  describe('POST /api/v1/routes', () => {
    it('creates route by OPERATOR (201)', async () => {
      const payload = {
        routeCode: 'EXP-102',
        name: 'South Delhi Shuttle',
        originStopId,
        destinationStopId,
        distanceKm: 18.2,
        estimatedDurationMinutes: 35,
      };

      const res = await request(app.getHttpServer())
        .post('/api/v1/routes')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send(payload)
        .expect(201);

      expect(res.body.id).toBe(routeId);
      expect(mockRoutesRepo.createRoute).toHaveBeenCalled();
    });

    it('returns 400 Bad Request if originStopId equals destinationStopId', async () => {
      const payload = {
        routeCode: 'EXP-103',
        name: 'Circular Bad Route',
        originStopId,
        destinationStopId: originStopId,
        distanceKm: 10,
        estimatedDurationMinutes: 20,
      };

      await request(app.getHttpServer())
        .post('/api/v1/routes')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send(payload)
        .expect(400);
    });

    it('returns 409 Conflict if routeCode already exists', async () => {
      const payload = {
        routeCode: 'EXP-101',
        name: 'Duplicate Route Code',
        originStopId,
        destinationStopId,
        distanceKm: 15,
        estimatedDurationMinutes: 25,
      };

      await request(app.getHttpServer())
        .post('/api/v1/routes')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send(payload)
        .expect(409);
    });

    it('returns 401 Unauthorized without token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/routes')
        .send({ routeCode: 'EXP-104', name: 'Test' })
        .expect(401);
    });

    it('returns 403 Forbidden for PASSENGER role', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/routes')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({ routeCode: 'EXP-104', name: 'Test' })
        .expect(403);
    });
  });

  describe('GET /api/v1/routes', () => {
    it('lists routes for PASSENGER (200)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/routes?limit=10&offset=0')
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(200);

      expect(res.body.items).toHaveLength(1);
      expect(res.body.total).toBe(1);
    });
  });

  describe('GET /api/v1/routes/:id', () => {
    it('returns route details by ID (200)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/routes/${routeId}`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(200);

      expect(res.body.id).toBe(routeId);
      expect(res.body.route_code).toBe('EXP-101');
    });

    it('returns 404 Not Found for non-existent route UUID', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/routes/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(404);
    });

    it('returns 400 Bad Request for malformed UUID', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/routes/invalid-uuid')
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(400);
    });
  });

  describe('PATCH /api/v1/routes/:id', () => {
    it('updates route details by OPERATOR (200)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/routes/${routeId}`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({ name: 'Airport Express Direct (Revised)' })
        .expect(200);

      expect(res.body.name).toBe('Airport Express Direct (Revised)');
    });

    it('returns 403 Forbidden for PASSENGER', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/routes/${routeId}`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({ name: 'Hacked Route Name' })
        .expect(403);
    });
  });

  describe('PATCH /api/v1/routes/:id/status', () => {
    it('updates route status to SUSPENDED by OPERATOR (200)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/routes/${routeId}/status`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({ status: 'SUSPENDED' })
        .expect(200);

      expect(res.body.status).toBe('SUSPENDED');
    });

    it('returns 400 Bad Request on invalid status enum', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/routes/${routeId}/status`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({ status: 'INVALID_STATUS' })
        .expect(400);
    });
  });

  describe('DELETE /api/v1/routes/:id', () => {
    it('soft-deletes route by OPERATOR (200)', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/routes/${routeId}`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(200);

      expect(res.body.status).toBe('INACTIVE');
    });

    it('returns 403 Forbidden for DRIVER', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/routes/${routeId}`)
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(403);
    });
  });

  describe('POST /api/v1/routes/:id/versions', () => {
    it('publishes a new version revision (201)', async () => {
      mockRoutesRepo.createRouteVersion.mockResolvedValueOnce({
        ...mockVersion,
        version_number: 2,
        change_notes: 'Updated geometry for road detour',
      });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/routes/${routeId}/versions`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({ changeNotes: 'Updated geometry for road detour' })
        .expect(201);

      expect(res.body.version_number).toBe(2);
    });
  });

  describe('GET /api/v1/routes/:id/versions', () => {
    it('lists route version history (200)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/routes/${routeId}/versions`)
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].version_number).toBe(1);
    });
  });
});
