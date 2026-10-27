import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { DatabaseService } from '../src/database/database.service';
import { GpsIngestionRepository } from '../src/gps-ingestion/repositories/gps-ingestion.repository';
import { RedisService } from '../src/redis/redis.service';

describe('GPS Ingestion (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  let operatorToken: string;
  let driverToken: string;
  let passengerToken: string;

  const operatorUserId = '11111111-1111-4111-a111-111111111111';
  const driverUserId = '22222222-2222-4222-a222-222222222222';
  const passengerUserId = '33333333-3333-4333-a333-333333333333';

  const vehicleId = '44444444-4444-4444-a444-444444444444';
  const deviceId = '55555555-5555-4555-a555-555555555555';
  const pointId = '66666666-6666-4666-a666-666666666666';
  const deviceImei = '862000000000001';

  const mockDevice: any = {
    id: deviceId,
    device_imei: deviceImei,
    vehicle_id: vehicleId,
    is_active: true,
  };

  const mockPoint: any = {
    id: pointId,
    vehicle_id: vehicleId,
    latitude: 28.6139,
    longitude: 77.209,
    speed_kmh: 40.0,
    recorded_at: new Date(),
    received_at: new Date(),
    source: 'GPS_DEVICE',
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
    findDeviceByImei: jest.fn().mockImplementation((imei: string) => {
      if (imei === deviceImei) return Promise.resolve(mockDevice);
      return Promise.resolve(null);
    }),
    insertLocationPoint: jest.fn().mockResolvedValue(mockPoint),
    updateVehicleTelemetry: jest.fn().mockResolvedValue(undefined),
    updateTripTelemetry: jest.fn().mockResolvedValue(undefined),
    insertTrackingEvent: jest.fn().mockResolvedValue({
      id: '77777777-7777-4777-a777-777777777777',
      device_id: deviceId,
      vehicle_id: vehicleId,
      event_type: 'OVERSPEED',
      payload: {},
      recorded_at: new Date(),
      created_at: new Date(),
    }),
    findLocationHistory: jest.fn().mockResolvedValue({
      items: [mockPoint],
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
      .overrideProvider(GpsIngestionRepository)
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

  describe('POST /api/v1/gps/ingest', () => {
    it('ingests single GPS fix by DRIVER (201)', async () => {
      const payload = {
        deviceImei,
        latitude: 28.6139,
        longitude: 77.209,
        speedKmh: 42.5,
        recordedAt: new Date().toISOString(),
      };

      const res = await request(app.getHttpServer())
        .post('/api/v1/gps/ingest')
        .set('Authorization', `Bearer ${driverToken}`)
        .send(payload)
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.id).toBe(pointId);
      expect(res.body.vehicleId).toBe(vehicleId);
    });

    it('returns 400 Bad Request on invalid coordinates', async () => {
      const payload = {
        deviceImei,
        latitude: 195.0, // Invalid latitude
        longitude: 77.209,
        speedKmh: 42.5,
        recordedAt: new Date().toISOString(),
      };

      await request(app.getHttpServer())
        .post('/api/v1/gps/ingest')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send(payload)
        .expect(400);
    });

    it('returns 404 Not Found if device is unregistered', async () => {
      const payload = {
        deviceImei: '999999999999999',
        latitude: 28.6139,
        longitude: 77.209,
        speedKmh: 42.5,
        recordedAt: new Date().toISOString(),
      };

      await request(app.getHttpServer())
        .post('/api/v1/gps/ingest')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send(payload)
        .expect(404);
    });

    it('returns 403 Forbidden for PASSENGER', async () => {
      const payload = {
        deviceImei,
        latitude: 28.6139,
        longitude: 77.209,
        speedKmh: 42.5,
        recordedAt: new Date().toISOString(),
      };

      await request(app.getHttpServer())
        .post('/api/v1/gps/ingest')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send(payload)
        .expect(403);
    });

    it('returns 401 Unauthorized without token', async () => {
      await request(app.getHttpServer()).post('/api/v1/gps/ingest').send({}).expect(401);
    });
  });

  describe('POST /api/v1/gps/ingest/batch', () => {
    it('ingests batch of GPS points by OPERATOR (201)', async () => {
      const payload = {
        points: [
          {
            deviceImei,
            latitude: 28.6139,
            longitude: 77.209,
            speedKmh: 40.0,
            recordedAt: new Date().toISOString(),
          },
        ],
      };

      const res = await request(app.getHttpServer())
        .post('/api/v1/gps/ingest/batch')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send(payload)
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.processedCount).toBe(1);
    });

    it('returns 400 Bad Request on empty points array', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/gps/ingest/batch')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({ points: [] })
        .expect(400);
    });

    it('returns 403 Forbidden for PASSENGER', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/gps/ingest/batch')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({ points: [] })
        .expect(403);
    });
  });

  describe('POST /api/v1/gps/events', () => {
    it('records telematics diagnostic event by DRIVER (201)', async () => {
      const payload = {
        deviceImei,
        eventType: 'OVERSPEED',
        payload: { speedKmh: 85, speedLimit: 60 },
        recordedAt: new Date().toISOString(),
      };

      const res = await request(app.getHttpServer())
        .post('/api/v1/gps/events')
        .set('Authorization', `Bearer ${driverToken}`)
        .send(payload)
        .expect(201);

      expect(res.body.event_type).toBe('OVERSPEED');
    });

    it('returns 403 Forbidden for PASSENGER', async () => {
      const payload = {
        deviceImei,
        eventType: 'IGNITION_ON',
        recordedAt: new Date().toISOString(),
      };

      await request(app.getHttpServer())
        .post('/api/v1/gps/events')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send(payload)
        .expect(403);
    });
  });

  describe('GET /api/v1/gps/history/:vehicleId', () => {
    it('queries historical location records for vehicle (200)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/gps/history/${vehicleId}?limit=10`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(200);

      expect(res.body.items).toHaveLength(1);
      expect(res.body.total).toBe(1);
    });

    it('returns 403 Forbidden for PASSENGER', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/gps/history/${vehicleId}`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(403);
    });
  });
});
