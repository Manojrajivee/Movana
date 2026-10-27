import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { DatabaseService } from '../src/database/database.service';
import { GeofencingRepository } from '../src/geofencing/repositories/geofencing.repository';
import { RedisService } from '../src/redis/redis.service';

describe('Geofencing (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  let operatorToken: string;
  let driverToken: string;
  let passengerToken: string;

  const operatorUserId = '11111111-1111-4111-a111-111111111111';
  const driverUserId = '22222222-2222-4222-a222-222222222222';
  const passengerUserId = '33333333-3333-4333-a333-333333333333';

  const geofenceId = '44444444-4444-4444-a444-444444444444';
  const vehicleId = '55555555-5555-4555-a555-555555555555';

  const mockGeofence: any = {
    id: geofenceId,
    name: 'ISBT Kashmiri Gate Terminal',
    description: 'Central transit terminal and depot',
    latitude: 28.6675,
    longitude: 77.2285,
    radius_meters: 500,
    type: 'TERMINAL',
    status: 'ACTIVE',
    created_at: new Date(),
    updated_at: new Date(),
  };

  const mockGeofenceEvent: any = {
    id: '66666666-6666-4666-a666-666666666666',
    geofence_id: geofenceId,
    vehicle_id: vehicleId,
    trip_id: null,
    event_type: 'ENTER',
    latitude: 28.6675,
    longitude: 77.2285,
    occurred_at: new Date(),
    created_at: new Date(),
    geofence_name: 'ISBT Kashmiri Gate Terminal',
    vehicle_code: 'BUS-DEL-101',
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

  const mockRepo = {
    createGeofence: jest.fn().mockResolvedValue(mockGeofence),
    findByName: jest.fn().mockImplementation((name: string) => {
      if (name === mockGeofence.name) return Promise.resolve(mockGeofence);
      return Promise.resolve(null);
    }),
    findById: jest.fn().mockImplementation((id: string) => {
      if (id === geofenceId) return Promise.resolve(mockGeofence);
      return Promise.resolve(null);
    }),
    findAll: jest.fn().mockResolvedValue({
      items: [mockGeofence],
      total: 1,
    }),
    findActiveGeofences: jest.fn().mockResolvedValue([mockGeofence]),
    updateGeofence: jest.fn().mockResolvedValue({
      ...mockGeofence,
      radius_meters: 600,
    }),
    deactivateGeofence: jest.fn().mockResolvedValue({
      ...mockGeofence,
      status: 'INACTIVE',
    }),
    insertGeofenceEvent: jest.fn().mockResolvedValue(mockGeofenceEvent),
    findLatestEventForVehicleAndGeofence: jest.fn().mockResolvedValue(null),
    findGeofenceEvents: jest.fn().mockResolvedValue({
      items: [mockGeofenceEvent],
      total: 1,
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
      .overrideProvider(GeofencingRepository)
      .useValue(mockRepo)
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

  describe('POST /api/v1/geofences', () => {
    it('creates geofence by OPERATOR (201)', async () => {
      const payload = {
        name: 'Sarai Kale Khan Inter-State Terminal',
        latitude: 28.5885,
        longitude: 77.2582,
        radiusMeters: 450,
      };

      const res = await request(app.getHttpServer())
        .post('/api/v1/geofences')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send(payload)
        .expect(201);

      expect(res.body.id).toBe(geofenceId);
      expect(mockRepo.createGeofence).toHaveBeenCalled();
    });

    it('returns 400 Bad Request on invalid radius (<= 0)', async () => {
      const payload = {
        name: 'Invalid Radius Geofence',
        latitude: 28.5885,
        longitude: 77.2582,
        radiusMeters: -50,
      };

      await request(app.getHttpServer())
        .post('/api/v1/geofences')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send(payload)
        .expect(400);
    });

    it('returns 409 Conflict on duplicate geofence name', async () => {
      const payload = {
        name: 'ISBT Kashmiri Gate Terminal',
        latitude: 28.6675,
        longitude: 77.2285,
        radiusMeters: 500,
      };

      await request(app.getHttpServer())
        .post('/api/v1/geofences')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send(payload)
        .expect(409);
    });

    it('returns 403 Forbidden for PASSENGER', async () => {
      const payload = {
        name: 'Unauthorized Terminal',
        latitude: 28.6675,
        longitude: 77.2285,
        radiusMeters: 500,
      };

      await request(app.getHttpServer())
        .post('/api/v1/geofences')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send(payload)
        .expect(403);
    });

    it('returns 401 Unauthorized without token', async () => {
      await request(app.getHttpServer()).post('/api/v1/geofences').send({}).expect(401);
    });
  });

  describe('GET /api/v1/geofences', () => {
    it('queries geofences by DRIVER (200)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/geofences?limit=10')
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(200);

      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].name).toBe('ISBT Kashmiri Gate Terminal');
    });
  });

  describe('GET /api/v1/geofences/:id', () => {
    it('gets geofence details by ID (200)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/geofences/${geofenceId}`)
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(200);

      expect(res.body.id).toBe(geofenceId);
    });

    it('returns 404 for non-existent geofence', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/geofences/99999999-9999-4999-a999-999999999999')
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(404);
    });
  });

  describe('PATCH /api/v1/geofences/:id', () => {
    it('updates geofence parameters by OPERATOR (200)', async () => {
      const payload = { radiusMeters: 600 };

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/geofences/${geofenceId}`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send(payload)
        .expect(200);

      expect(res.body.radius_meters).toBe(600);
    });

    it('returns 403 Forbidden for PASSENGER', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/geofences/${geofenceId}`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({ radiusMeters: 600 })
        .expect(403);
    });
  });

  describe('DELETE /api/v1/geofences/:id', () => {
    it('returns 403 Forbidden for PASSENGER', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/geofences/${geofenceId}`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(403);
    });

    it('deactivates geofence by OPERATOR (200)', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/geofences/${geofenceId}`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(200);

      expect(res.body.status).toBe('INACTIVE');
    });
  });

  describe('POST /api/v1/geofences/evaluate', () => {
    it('evaluates vehicle position and emits transition events (200)', async () => {
      const payload = {
        vehicleId,
        latitude: 28.6675,
        longitude: 77.2285,
      };

      const res = await request(app.getHttpServer())
        .post('/api/v1/geofences/evaluate')
        .set('Authorization', `Bearer ${driverToken}`)
        .send(payload)
        .expect(200);

      expect(res.body.evaluatedCount).toBe(1);
      expect(res.body.insideGeofenceIds).toContain(geofenceId);
    });

    it('returns 403 Forbidden for PASSENGER', async () => {
      const payload = {
        vehicleId,
        latitude: 28.6675,
        longitude: 77.2285,
      };

      await request(app.getHttpServer())
        .post('/api/v1/geofences/evaluate')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send(payload)
        .expect(403);
    });
  });

  describe('POST /api/v1/geofences/events', () => {
    it('records explicit transition event by DRIVER (201)', async () => {
      const payload = {
        geofenceId,
        vehicleId,
        eventType: 'ENTER',
        latitude: 28.6675,
        longitude: 77.2285,
      };

      const res = await request(app.getHttpServer())
        .post('/api/v1/geofences/events')
        .set('Authorization', `Bearer ${driverToken}`)
        .send(payload)
        .expect(201);

      expect(res.body.event_type).toBe('ENTER');
    });

    it('returns 403 Forbidden for PASSENGER', async () => {
      const payload = {
        geofenceId,
        vehicleId,
        eventType: 'ENTER',
        latitude: 28.6675,
        longitude: 77.2285,
      };

      await request(app.getHttpServer())
        .post('/api/v1/geofences/events')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send(payload)
        .expect(403);
    });
  });

  describe('GET /api/v1/geofences/events', () => {
    it('queries transition events by OPERATOR (200)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/geofences/events?limit=10')
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(200);

      expect(res.body.items).toHaveLength(1);
    });

    it('returns 403 Forbidden for PASSENGER', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/geofences/events')
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(403);
    });
  });
});
