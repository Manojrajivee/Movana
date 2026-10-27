import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { DatabaseService } from '../src/database/database.service';
import { RedisService } from '../src/redis/redis.service';
import { BusDevicesRepository } from '../src/bus-devices/repositories/bus-devices.repository';

describe('Bus Devices (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  let operatorToken: string;
  let passengerToken: string;
  let driverToken: string;

  const operatorUserId = '11111111-1111-4111-a111-111111111111';
  const passengerUserId = '22222222-2222-4222-a222-222222222222';
  const driverUserId = '33333333-3333-4333-a333-333333333333';

  const deviceId = '44444444-4444-4444-a444-444444444444';
  const vehicleId = '55555555-5555-4555-a555-555555555555';
  const decommissionedVehicleId = '66666666-6666-4666-a666-666666666666';
  const conflictVehicleId = '77777777-7777-4777-a777-777777777777';

  const mockDevice: any = {
    id: deviceId,
    device_imei: '864298031234567',
    device_model: 'Teltonika FMB920',
    firmware_version: '03.28.02.Rev.00',
    vehicle_id: null,
    is_active: true,
    installed_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    vehicle_code: null,
    registration_number: null,
    vehicle_status: null,
  };

  const mockVehicle: any = {
    id: vehicleId,
    vehicle_code: 'BUS-101',
    registration_number: 'DL-01-AB-101',
    status: 'ACTIVE',
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

  const mockBusDevicesRepo = {
    createDevice: jest.fn().mockResolvedValue(mockDevice),
    findById: jest.fn().mockImplementation((id: string) => {
      if (id === deviceId) return Promise.resolve(mockDevice);
      return Promise.resolve(null);
    }),
    findByImei: jest.fn().mockImplementation((imei: string) => {
      if (imei === '864298031234567') return Promise.resolve(mockDevice);
      return Promise.resolve(null);
    }),
    findActiveByVehicleId: jest.fn().mockImplementation((vId: string) => {
      if (vId === conflictVehicleId) {
        return Promise.resolve({
          ...mockDevice,
          id: 'another-device-id',
          device_imei: '864298039999999',
          vehicle_id: vId,
        });
      }
      return Promise.resolve(null);
    }),
    findVehicleById: jest.fn().mockImplementation((vId: string) => {
      if (vId === vehicleId || vId === conflictVehicleId) return Promise.resolve(mockVehicle);
      if (vId === decommissionedVehicleId) {
        return Promise.resolve({ ...mockVehicle, id: vId, status: 'DECOMMISSIONED' });
      }
      return Promise.resolve(null);
    }),
    findAll: jest.fn().mockResolvedValue({
      items: [mockDevice],
      total: 1,
    }),
    updateDevice: jest.fn().mockResolvedValue({
      ...mockDevice,
      device_model: 'Teltonika FMB920-Pro',
    }),
    pairDevice: jest.fn().mockResolvedValue({
      ...mockDevice,
      vehicle_id: vehicleId,
      installed_at: new Date(),
      vehicle_code: 'BUS-101',
      registration_number: 'DL-01-AB-101',
    }),
    unpairDevice: jest.fn().mockResolvedValue({
      ...mockDevice,
      vehicle_id: null,
      installed_at: null,
    }),
    decommissionDevice: jest.fn().mockResolvedValue({
      ...mockDevice,
      is_active: false,
      vehicle_id: null,
    }),
    getLatestTelemetry: jest.fn().mockResolvedValue({
      latitude: 28.6139,
      longitude: 77.209,
      speed_kmh: 40.0,
      recorded_at: new Date(),
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
      .overrideProvider(BusDevicesRepository)
      .useValue(mockBusDevicesRepo)
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

  describe('POST /api/v1/bus-devices', () => {
    it('successfully registers device by OPERATOR (201)', async () => {
      const payload = {
        deviceImei: '864298030000001',
        deviceModel: 'Teltonika FMC130',
        firmwareVersion: '01.00.00',
      };

      const res = await request(app.getHttpServer())
        .post('/api/v1/bus-devices')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send(payload)
        .expect(201);

      expect(res.body.id).toBe(deviceId);
      expect(mockBusDevicesRepo.createDevice).toHaveBeenCalled();
    });

    it('returns 400 Bad Request on invalid IMEI format', async () => {
      const payload = {
        deviceImei: 'invalid@imei!',
        deviceModel: 'Teltonika FMC130',
      };

      await request(app.getHttpServer())
        .post('/api/v1/bus-devices')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send(payload)
        .expect(400);
    });

    it('returns 409 Conflict if IMEI already registered', async () => {
      const payload = {
        deviceImei: '864298031234567',
        deviceModel: 'Teltonika FMB920',
      };

      await request(app.getHttpServer())
        .post('/api/v1/bus-devices')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send(payload)
        .expect(409);
    });

    it('returns 401 Unauthorized without token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/bus-devices')
        .send({ deviceImei: '864298030000002', deviceModel: 'Test' })
        .expect(401);
    });

    it('returns 403 Forbidden for PASSENGER role', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/bus-devices')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({ deviceImei: '864298030000002', deviceModel: 'Test' })
        .expect(403);
    });
  });

  describe('GET /api/v1/bus-devices', () => {
    it('lists tracking devices for OPERATOR (200)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/bus-devices?limit=10&offset=0')
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(200);

      expect(res.body.items).toHaveLength(1);
      expect(res.body.total).toBe(1);
    });

    it('returns 403 Forbidden for PASSENGER role', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/bus-devices')
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(403);
    });
  });

  describe('GET /api/v1/bus-devices/:id', () => {
    it('returns tracking device by ID (200)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/bus-devices/${deviceId}`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(200);

      expect(res.body.id).toBe(deviceId);
    });

    it('returns 404 Not Found for non-existent UUID', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/bus-devices/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(404);
    });

    it('returns 400 Bad Request for malformed UUID', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/bus-devices/not-a-uuid')
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(400);
    });
  });

  describe('PATCH /api/v1/bus-devices/:id', () => {
    it('updates device details (200)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/bus-devices/${deviceId}`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({ deviceModel: 'Teltonika FMB920-Pro' })
        .expect(200);

      expect(res.body.device_model).toBe('Teltonika FMB920-Pro');
    });
  });

  describe('POST /api/v1/bus-devices/:id/pair', () => {
    it('pairs device to active vehicle (200)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/bus-devices/${deviceId}/pair`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({ vehicleId })
        .expect(200);

      expect(res.body.vehicle_id).toBe(vehicleId);
    });

    it('returns 400 Bad Request when vehicle is decommissioned', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/bus-devices/${deviceId}/pair`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({ vehicleId: decommissionedVehicleId })
        .expect(400);
    });

    it('returns 409 Conflict when vehicle already has active device paired', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/bus-devices/${deviceId}/pair`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({ vehicleId: conflictVehicleId })
        .expect(409);
    });
  });

  describe('POST /api/v1/bus-devices/:id/unpair', () => {
    it('unpairs device from vehicle (200)', async () => {
      mockBusDevicesRepo.findById.mockResolvedValueOnce({
        ...mockDevice,
        vehicle_id: vehicleId,
      });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/bus-devices/${deviceId}/unpair`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(200);

      expect(res.body.vehicle_id).toBeNull();
    });

    it('returns 400 Bad Request if device is not currently paired', async () => {
      mockBusDevicesRepo.findById.mockResolvedValueOnce({
        ...mockDevice,
        vehicle_id: null,
      });

      await request(app.getHttpServer())
        .post(`/api/v1/bus-devices/${deviceId}/unpair`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(400);
    });
  });

  describe('GET /api/v1/bus-devices/:id/status', () => {
    it('returns status with telemetry for paired device (200)', async () => {
      mockBusDevicesRepo.findById.mockResolvedValueOnce({
        ...mockDevice,
        vehicle_id: vehicleId,
        vehicle_code: 'BUS-101',
        registration_number: 'DL-01-AB-101',
        vehicle_status: 'ACTIVE',
      });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/bus-devices/${deviceId}/status`)
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(200);

      expect(res.body.deviceId).toBe(deviceId);
      expect(res.body.isPaired).toBe(true);
      expect(res.body.pairedVehicle.code).toBe('BUS-101');
      expect(res.body.latestTelemetry).toBeDefined();
    });
  });

  describe('DELETE /api/v1/bus-devices/:id', () => {
    it('decommissions device by OPERATOR (200)', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/bus-devices/${deviceId}`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(200);

      expect(res.body.is_active).toBe(false);
    });

    it('returns 403 Forbidden for DRIVER', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/bus-devices/${deviceId}`)
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(403);
    });
  });
});
