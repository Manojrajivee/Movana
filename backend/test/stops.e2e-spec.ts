import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { DatabaseService } from '../src/database/database.service';
import { RedisService } from '../src/redis/redis.service';
import { StopsRepository } from '../src/stops/repositories/stops.repository';

describe('Stops (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  let operatorToken: string;
  let passengerToken: string;
  let driverToken: string;

  const operatorUserId = '11111111-1111-4111-a111-111111111111';
  const passengerUserId = '22222222-2222-4222-a222-222222222222';
  const driverUserId = '33333333-3333-4333-a333-333333333333';

  const stopId = '44444444-4444-4444-a444-444444444444';

  const mockStop: any = {
    id: stopId,
    stop_code: 'STOP-DEL-501',
    name: 'Rajiv Chowk Metro Concourse',
    description: 'Central Connaught Place concourse exit 4',
    address: 'Block B, Connaught Place',
    city: 'New Delhi',
    state: 'Delhi',
    country: 'India',
    postal_code: '110001',
    latitude: 28.6328,
    longitude: 77.2197,
    geofence_radius_meters: 100,
    status: 'ACTIVE',
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

  const mockStopsRepo = {
    createStop: jest.fn().mockResolvedValue(mockStop),
    findByCode: jest.fn().mockImplementation((code: string) => {
      if (code === 'STOP-DEL-501') return Promise.resolve(mockStop);
      return Promise.resolve(null);
    }),
    findById: jest.fn().mockImplementation((id: string) => {
      if (id === stopId) return Promise.resolve(mockStop);
      return Promise.resolve(null);
    }),
    findAll: jest.fn().mockResolvedValue({
      items: [mockStop],
      total: 1,
    }),
    findNearby: jest.fn().mockResolvedValue([
      {
        ...mockStop,
        distance_km: 0.85,
      },
    ]),
    updateStop: jest.fn().mockResolvedValue({
      ...mockStop,
      name: 'Rajiv Chowk Metro Concourse (Updated)',
    }),
    updateStatus: jest.fn().mockResolvedValue({
      ...mockStop,
      status: 'TEMPORARILY_CLOSED',
    }),
    deleteStop: jest.fn().mockResolvedValue(mockStop),
    countActiveRoutesUsingStop: jest.fn().mockResolvedValue(0),
    countRouteStopsUsingStop: jest.fn().mockResolvedValue(0),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useValue(mockDatabaseService)
      .overrideProvider(RedisService)
      .useValue(mockRedisService)
      .overrideProvider(StopsRepository)
      .useValue(mockStopsRepo)
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

  describe('POST /api/v1/stops', () => {
    it('creates stop by OPERATOR (201)', async () => {
      const payload = {
        stopCode: 'STOP-DEL-502',
        name: 'Patel Chowk Metro Platform',
        address: 'Ashoka Road',
        city: 'New Delhi',
        state: 'Delhi',
        latitude: 28.6231,
        longitude: 77.2145,
      };

      const res = await request(app.getHttpServer())
        .post('/api/v1/stops')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send(payload)
        .expect(201);

      expect(res.body.id).toBe(stopId);
      expect(mockStopsRepo.createStop).toHaveBeenCalled();
    });

    it('returns 400 Bad Request on invalid coordinates', async () => {
      const payload = {
        stopCode: 'STOP-DEL-503',
        name: 'Bad Lat Stop',
        address: 'Street',
        city: 'New Delhi',
        state: 'Delhi',
        latitude: 195.0, // Invalid latitude
        longitude: 77.2145,
      };

      await request(app.getHttpServer())
        .post('/api/v1/stops')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send(payload)
        .expect(400);
    });

    it('returns 409 Conflict on duplicate stopCode', async () => {
      const payload = {
        stopCode: 'STOP-DEL-501',
        name: 'Duplicate Stop Code',
        address: 'Street',
        city: 'New Delhi',
        state: 'Delhi',
        latitude: 28.6328,
        longitude: 77.2197,
      };

      await request(app.getHttpServer())
        .post('/api/v1/stops')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send(payload)
        .expect(409);
    });

    it('returns 403 Forbidden for PASSENGER role', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/stops')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({ stopCode: 'STOP-DEL-504', name: 'Test' })
        .expect(403);
    });
  });

  describe('GET /api/v1/stops', () => {
    it('lists stops for PASSENGER (200)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/stops?limit=10&offset=0')
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(200);

      expect(res.body.items).toHaveLength(1);
      expect(res.body.total).toBe(1);
    });
  });

  describe('GET /api/v1/stops/nearby', () => {
    it('returns nearby stops with distance (200)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/stops/nearby?latitude=28.63&longitude=77.21&radiusKm=5')
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].distance_km).toBe(0.85);
    });

    it('returns 400 Bad Request if latitude is out of range', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/stops/nearby?latitude=120.0&longitude=77.21')
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(400);
    });
  });

  describe('GET /api/v1/stops/:id', () => {
    it('returns stop details by ID (200)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/stops/${stopId}`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(200);

      expect(res.body.id).toBe(stopId);
      expect(res.body.stop_code).toBe('STOP-DEL-501');
    });

    it('returns 404 Not Found for non-existent stop UUID', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/stops/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(404);
    });
  });

  describe('PATCH /api/v1/stops/:id', () => {
    it('updates stop details by OPERATOR (200)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/stops/${stopId}`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({ name: 'Rajiv Chowk Metro Concourse (Updated)' })
        .expect(200);

      expect(res.body.name).toBe('Rajiv Chowk Metro Concourse (Updated)');
    });

    it('returns 403 Forbidden for PASSENGER', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/stops/${stopId}`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({ name: 'Hacked Stop' })
        .expect(403);
    });
  });

  describe('PATCH /api/v1/stops/:id/status', () => {
    it('updates stop status by OPERATOR (200)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/stops/${stopId}/status`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({ status: 'TEMPORARILY_CLOSED' })
        .expect(200);

      expect(res.body.status).toBe('TEMPORARILY_CLOSED');
    });

    it('returns 409 Conflict if deactivating stop when active routes depend on it', async () => {
      mockStopsRepo.countActiveRoutesUsingStop.mockResolvedValueOnce(3);

      await request(app.getHttpServer())
        .patch(`/api/v1/stops/${stopId}/status`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({ status: 'INACTIVE' })
        .expect(409);
    });
  });

  describe('DELETE /api/v1/stops/:id', () => {
    it('deletes stop by OPERATOR (200)', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/stops/${stopId}`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(200);

      expect(res.body.id).toBe(stopId);
    });

    it('returns 409 Conflict if active routes depend on stop', async () => {
      mockStopsRepo.countActiveRoutesUsingStop.mockResolvedValueOnce(2);

      await request(app.getHttpServer())
        .delete(`/api/v1/stops/${stopId}`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(409);
    });

    it('returns 403 Forbidden for DRIVER', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/stops/${stopId}`)
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(403);
    });
  });
});
