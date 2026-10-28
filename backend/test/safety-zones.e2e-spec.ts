import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { DatabaseService } from '../src/database/database.service';
import { IncidentsService } from '../src/incidents/services/incidents.service';
import { RealTimeService } from '../src/real-time/services/real-time.service';
import { RedisService } from '../src/redis/redis.service';
import { SafetyZonesRepository } from '../src/safety-zones/repositories/safety-zones.repository';

describe('Safety Zones (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  let passengerToken: string;
  let driverToken: string;
  let safetyOfficerToken: string;
  let adminToken: string;

  const passengerId = '11111111-1111-4111-a111-111111111111';
  const driverUserId = '22222222-2222-4222-a222-222222222222';
  const safetyOfficerId = '33333333-3333-4333-a333-333333333333';
  const adminId = '44444444-4444-4444-a444-444444444444';

  const geofenceId = '55555555-5555-4555-a555-555555555555';
  const unconfiguredGeofenceId = '66666666-6666-4666-a666-666666666666';
  const vehicleId = '77777777-7777-4777-a777-777777777777';
  const tripId = '88888888-8888-4888-a888-888888888888';

  const mockGeofence = {
    id: geofenceId,
    name: 'Metropolitan High School Perimeter',
    description: 'School zone with 30 km/h speed restriction',
    latitude: 13.0827,
    longitude: 80.2707,
    radius_meters: 400,
    type: 'SAFETY_ZONE',
    status: 'ACTIVE',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const mockUnconfiguredGeofence = {
    id: unconfiguredGeofenceId,
    name: 'General Depot Perimeter',
    description: 'Depot zone without custom speed policy',
    latitude: 13.04,
    longitude: 80.24,
    radius_meters: 300,
    type: 'TERMINAL',
    status: 'ACTIVE',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const mockSafetyZoneConfig = {
    geofenceId,
    speedLimitKmh: 30,
    riskLevel: 'HIGH' as const,
    zoneCategory: 'SCHOOL_ZONE' as const,
    cooldownMinutes: 15,
    autoReportIncident: true,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
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

  let mockConfigsStore: Map<string, any> = new Map();
  let mockCooldownStore: Set<string> = new Set();

  const mockSafetyZonesRepo = {
    findGeofenceById: jest.fn().mockImplementation((id: string) => {
      if (id === geofenceId) return Promise.resolve(mockGeofence);
      if (id === unconfiguredGeofenceId) return Promise.resolve(mockUnconfiguredGeofence);
      return Promise.resolve(null);
    }),
    findActiveGeofences: jest.fn().mockResolvedValue([mockGeofence, mockUnconfiguredGeofence]),
    validateVehicleExists: jest.fn().mockResolvedValue(true),
    recordGeofenceEvent: jest.fn().mockResolvedValue(undefined),
    saveSafetyZoneConfig: jest.fn().mockImplementation((cfg) => {
      mockConfigsStore.set(cfg.geofenceId, cfg);
      return Promise.resolve(cfg);
    }),
    findSafetyZoneConfig: jest.fn().mockImplementation((id: string) => {
      return Promise.resolve(mockConfigsStore.get(id) || null);
    }),
    findAllSafetyZoneConfigs: jest.fn().mockImplementation(() => {
      return Promise.resolve(Array.from(mockConfigsStore.values()));
    }),
    deleteSafetyZoneConfig: jest.fn().mockImplementation((id: string) => {
      mockConfigsStore.delete(id);
      return Promise.resolve(true);
    }),
    checkAndSetAlertCooldown: jest.fn().mockImplementation((fenceId: string, vehId: string) => {
      const key = `${fenceId}:${vehId}`;
      if (mockCooldownStore.has(key)) {
        return Promise.resolve({ isDuplicate: true });
      }
      mockCooldownStore.add(key);
      return Promise.resolve({ isDuplicate: false });
    }),
    recordRecentAlert: jest.fn().mockResolvedValue(undefined),
    getRecentAlerts: jest.fn().mockResolvedValue([
      {
        geofenceId,
        geofenceName: 'Metropolitan High School Perimeter',
        vehicleId,
        actualSpeedKmh: 58,
        speedLimitKmh: 30,
        overspeedKmh: 28,
        occurredAt: new Date().toISOString(),
      },
    ]),
  };

  const mockRedisService = {
    isAvailable: jest.fn().mockReturnValue(true),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    publish: jest.fn().mockResolvedValue(1),
  };

  const mockIncidentsService = {
    reportIncident: jest.fn().mockResolvedValue({
      id: 'inc-auto-123',
      incident_number: 'INC-20261028-AUTO99',
    }),
  };

  const mockRealTimeService = {
    setServer: jest.fn(),
    publishToRoom: jest.fn().mockResolvedValue({ deliveredLocally: true }),
  };

  beforeAll(async () => {
    mockConfigsStore.set(geofenceId, mockSafetyZoneConfig);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useValue(mockDatabaseService)
      .overrideProvider(SafetyZonesRepository)
      .useValue(mockSafetyZonesRepo)
      .overrideProvider(RedisService)
      .useValue(mockRedisService)
      .overrideProvider(IncidentsService)
      .useValue(mockIncidentsService)
      .overrideProvider(RealTimeService)
      .useValue(mockRealTimeService)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    jwtService = app.get<JwtService>(JwtService);

    passengerToken = jwtService.sign({
      sub: passengerId,
      email: 'passenger@movana.internal',
      roles: ['PASSENGER'],
    });

    driverToken = jwtService.sign({
      sub: driverUserId,
      email: 'driver@movana.internal',
      roles: ['DRIVER'],
    });

    safetyOfficerToken = jwtService.sign({
      sub: safetyOfficerId,
      email: 'safety@movana.internal',
      roles: ['SAFETY_OFFICER'],
    });

    adminToken = jwtService.sign({
      sub: adminId,
      email: 'admin@movana.internal',
      roles: ['ADMIN'],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Authentication & Authorization', () => {
    it('should reject unauthenticated requests with 401', async () => {
      await request(app.getHttpServer()).get('/api/v1/safety-zones').expect(401);
      await request(app.getHttpServer()).post('/api/v1/safety-zones').send({}).expect(401);
      await request(app.getHttpServer()).post('/api/v1/safety-zones/evaluate').send({}).expect(401);
    });

    it('should reject passenger from administrative POST/PATCH/DELETE with 403', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/safety-zones')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({
          geofenceId,
          speedLimitKmh: 30,
        })
        .expect(403);

      await request(app.getHttpServer())
        .patch(`/api/v1/safety-zones/${geofenceId}`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({ speedLimitKmh: 20 })
        .expect(403);

      await request(app.getHttpServer())
        .delete(`/api/v1/safety-zones/${geofenceId}`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(403);
    });

    it('should allow safety officer and admin to access administrative endpoints', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/safety-zones/active-alerts')
        .set('Authorization', `Bearer ${safetyOfficerToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .get('/api/v1/safety-zones/active-alerts')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });
  });

  describe('POST /api/v1/safety-zones (Configure Safety Zone)', () => {
    it('should reject invalid payload with 400', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/safety-zones')
        .set('Authorization', `Bearer ${safetyOfficerToken}`)
        .send({
          geofenceId: 'not-a-uuid',
          speedLimitKmh: 200, // exceeds max 120
        })
        .expect(400);
    });

    it('should reject non-existent geofence with 404', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/safety-zones')
        .set('Authorization', `Bearer ${safetyOfficerToken}`)
        .send({
          geofenceId: '00000000-0000-4000-a000-000000000000',
          speedLimitKmh: 40,
        })
        .expect(404);
    });

    it('should reject already configured geofence with 409', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/safety-zones')
        .set('Authorization', `Bearer ${safetyOfficerToken}`)
        .send({
          geofenceId,
          speedLimitKmh: 30,
        })
        .expect(409);
    });

    it('should reject inactive geofence with 400', async () => {
      mockSafetyZonesRepo.findGeofenceById.mockResolvedValueOnce({
        ...mockGeofence,
        status: 'INACTIVE',
      });

      await request(app.getHttpServer())
        .post('/api/v1/safety-zones')
        .set('Authorization', `Bearer ${safetyOfficerToken}`)
        .send({
          geofenceId: '88888888-8888-4888-a888-888888888888',
          speedLimitKmh: 30,
        })
        .expect(400);
    });

    it('should return 503 when Redis service is unavailable during configuration', async () => {
      mockSafetyZonesRepo.findGeofenceById.mockResolvedValueOnce(mockUnconfiguredGeofence);
      mockSafetyZonesRepo.findSafetyZoneConfig.mockResolvedValueOnce(null);
      mockSafetyZonesRepo.saveSafetyZoneConfig.mockRejectedValueOnce(
        new Error('Redis connection failed'),
      );

      await request(app.getHttpServer())
        .post('/api/v1/safety-zones')
        .set('Authorization', `Bearer ${safetyOfficerToken}`)
        .send({
          geofenceId: unconfiguredGeofenceId,
          speedLimitKmh: 30,
        })
        .expect(503);
    });

    it('should configure safety zone policy successfully for new geofence', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/safety-zones')
        .set('Authorization', `Bearer ${safetyOfficerToken}`)
        .send({
          geofenceId: unconfiguredGeofenceId,
          speedLimitKmh: 25,
          riskLevel: 'MEDIUM',
          zoneCategory: 'CONSTRUCTION_ZONE',
          cooldownMinutes: 10,
        })
        .expect(201);

      expect(res.body.geofenceId).toBe(unconfiguredGeofenceId);
      expect(res.body.speedLimitKmh).toBe(25);
      expect(res.body.geofence).toBeDefined();
    });
  });

  describe('GET /api/v1/safety-zones (List & Query)', () => {
    it('should return list of configured safety zones', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/safety-zones?limit=10&offset=0')
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(200);

      expect(Array.isArray(res.body.items)).toBe(true);
      expect(res.body.total).toBeGreaterThan(0);
    });
  });

  describe('GET /api/v1/safety-zones/:id (Get by ID)', () => {
    it('should return 404 for non-existent geofence ID', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/safety-zones/00000000-0000-4000-a000-000000000000')
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(404);
    });

    it('should return configured safety zone with geofence data', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/safety-zones/${geofenceId}`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(200);

      expect(res.body.geofenceId).toBe(geofenceId);
      expect(res.body.speedLimitKmh).toBe(30);
      expect(res.body.geofence.name).toBe('Metropolitan High School Perimeter');
    });
  });

  describe('PATCH /api/v1/safety-zones/:id (Update Policy)', () => {
    it('should update speed limit and settings for existing safety zone', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/safety-zones/${geofenceId}`)
        .set('Authorization', `Bearer ${safetyOfficerToken}`)
        .send({
          speedLimitKmh: 20,
          riskLevel: 'CRITICAL',
        })
        .expect(200);

      expect(res.body.speedLimitKmh).toBe(20);
      expect(res.body.riskLevel).toBe('CRITICAL');
    });
  });

  describe('DELETE /api/v1/safety-zones/:id (Delete Policy)', () => {
    it('should delete safety zone policy when called by admin', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/safety-zones/${unconfiguredGeofenceId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /api/v1/safety-zones/evaluate (Evaluation & Alerts)', () => {
    it('should return 400 for invalid coordinates (latitude > 90)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/safety-zones/evaluate')
        .set('Authorization', `Bearer ${driverToken}`)
        .send({
          vehicleId,
          latitude: 95.0,
          longitude: 80.0,
          speedKmh: 40,
        })
        .expect(400);
    });

    it('should report no violations when vehicle is traveling safely inside zone', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/safety-zones/evaluate')
        .set('Authorization', `Bearer ${driverToken}`)
        .send({
          vehicleId,
          latitude: 13.0827,
          longitude: 80.2707,
          speedKmh: 18, // Within limit of 20 km/h
        })
        .expect(200);

      expect(res.body.insideZoneCount).toBeGreaterThanOrEqual(1);
      expect(res.body.violations).toHaveLength(0);
    });

    it('should detect overspeed violation, dispatch real-time alert and auto-report incident', async () => {
      const testVehicleId = '99999999-9999-4999-a999-999999999999';

      const res = await request(app.getHttpServer())
        .post('/api/v1/safety-zones/evaluate')
        .set('Authorization', `Bearer ${driverToken}`)
        .send({
          vehicleId: testVehicleId,
          tripId,
          latitude: 13.0827,
          longitude: 80.2707,
          speedKmh: 55, // Over limit of 20 km/h by 35 km/h
        })
        .expect(200);

      expect(res.body.violations).toHaveLength(1);
      const v = res.body.violations[0];
      expect(v.overspeedKmh).toBe(35);
      expect(v.alertDispatched).toBe(true);
      expect(v.deduplicated).toBe(false);
      expect(v.incidentId).toBe('inc-auto-123');
    });

    it('should deduplicate alert when same vehicle overspeeds during active cooldown', async () => {
      const testVehicleId = '99999999-9999-4999-a999-999999999999';

      const res = await request(app.getHttpServer())
        .post('/api/v1/safety-zones/evaluate')
        .set('Authorization', `Bearer ${driverToken}`)
        .send({
          vehicleId: testVehicleId,
          tripId,
          latitude: 13.0827,
          longitude: 80.2707,
          speedKmh: 58,
        })
        .expect(200);

      expect(res.body.violations).toHaveLength(1);
      const v = res.body.violations[0];
      expect(v.deduplicated).toBe(true);
      expect(v.alertDispatched).toBe(false);
    });
  });

  describe('GET /api/v1/safety-zones/active-alerts', () => {
    it('should return recent safety zone alerts for operations staff', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/safety-zones/active-alerts?limit=20')
        .set('Authorization', `Bearer ${safetyOfficerToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0].actualSpeedKmh).toBe(58);
    });
  });
});
