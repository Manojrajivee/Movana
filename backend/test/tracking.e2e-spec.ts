import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { DatabaseService } from '../src/database/database.service';
import { RedisService } from '../src/redis/redis.service';
import { TrackingRepository } from '../src/tracking/repositories/tracking.repository';

describe('Tracking (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  let operatorToken: string;
  let passengerToken: string;

  const operatorUserId = '11111111-1111-4111-a111-111111111111';
  const passengerUserId = '22222222-2222-4222-a222-222222222222';

  const vehicleId = '33333333-3333-4333-a333-333333333333';
  const tripId = '44444444-4444-4444-a444-444444444444';

  const mockVehicleTracking: any = {
    vehicle_id: vehicleId,
    vehicle_code: 'BUS-DEL-101',
    registration_number: 'DL-01-AB-1234',
    vehicle_type: 'Low-Floor Electric Bus',
    vehicle_status: 'ACTIVE',
    current_latitude: 28.6139,
    current_longitude: 77.209,
    last_location_at: new Date(),
    current_odometer: 14500.5,
    fuel_type: 'ELECTRIC',
    device_imei: '862000000000001',
    active_trip_id: tripId,
    active_trip_number: 'TRIP-DEL-JPR-101',
    active_trip_status: 'IN_TRANSIT',
  };

  const mockTripTracking: any = {
    trip_id: tripId,
    trip_number: 'TRIP-DEL-JPR-101',
    route_code: 'DEL-JPR-01',
    route_name: 'Delhi to Jaipur High Speed',
    origin_stop: 'ISBT Kashmiri Gate',
    destination_stop: 'Sindhi Camp Jaipur',
    vehicle_code: 'BUS-DEL-101',
    registration_number: 'DL-01-AB-1234',
    primary_driver_name: 'Rajesh Sharma',
    driver_phone: '+919876543210',
    scheduled_departure_at: new Date(),
    scheduled_arrival_at: new Date(Date.now() + 6 * 3600 * 1000),
    actual_departure_at: new Date(),
    actual_arrival_at: null,
    delay_minutes: 0,
    trip_status: 'IN_TRANSIT',
    current_stop: 'Gurugram IFFCO Chowk',
    current_latitude: 28.472,
    current_longitude: 77.0725,
    last_telemetry_at: new Date(),
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

  const mockTrackingRepo = {
    findActiveVehicles: jest.fn().mockResolvedValue({
      items: [mockVehicleTracking],
      total: 1,
    }),
    findVehicleTrackingById: jest.fn().mockImplementation((id: string) => {
      if (id === vehicleId) return Promise.resolve(mockVehicleTracking);
      return Promise.resolve(null);
    }),
    findTripTrackingById: jest.fn().mockImplementation((id: string) => {
      if (id === tripId) return Promise.resolve(mockTripTracking);
      return Promise.resolve(null);
    }),
    findNearbyVehicles: jest.fn().mockResolvedValue([
      {
        ...mockVehicleTracking,
        distance_km: 1.25,
      },
    ]),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useValue(mockDatabaseService)
      .overrideProvider(RedisService)
      .useValue(mockRedisService)
      .overrideProvider(TrackingRepository)
      .useValue(mockTrackingRepo)
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

  describe('GET /api/v1/tracking/vehicles', () => {
    it('returns active vehicle tracking feed for PASSENGER (200)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/tracking/vehicles?limit=10')
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(200);

      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].vehicle_code).toBe('BUS-DEL-101');
      expect(mockTrackingRepo.findActiveVehicles).toHaveBeenCalled();
    });

    it('returns 401 Unauthorized without token', async () => {
      await request(app.getHttpServer()).get('/api/v1/tracking/vehicles').expect(401);
    });
  });

  describe('GET /api/v1/tracking/nearby', () => {
    it('returns nearby live vehicles for PASSENGER (200)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/tracking/nearby?latitude=28.6139&longitude=77.2090&radiusKm=5')
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].distance_km).toBe(1.25);
    });

    it('returns 400 Bad Request on invalid latitude (> 90)', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/tracking/nearby?latitude=95.0&longitude=77.2090')
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(400);
    });
  });

  describe('GET /api/v1/tracking/vehicles/:id', () => {
    it('returns vehicle real-time location and telemetry (200)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/tracking/vehicles/${vehicleId}`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(200);

      expect(res.body.vehicle_id).toBe(vehicleId);
      expect(res.body.vehicle_code).toBe('BUS-DEL-101');
    });

    it('returns 404 for non-existent vehicle ID', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/tracking/vehicles/99999999-9999-4999-a999-999999999999')
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(404);
    });

    it('returns 400 for non-UUID parameter', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/tracking/vehicles/invalid-uuid')
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(400);
    });
  });

  describe('GET /api/v1/tracking/trips/:id', () => {
    it('returns active trip journey tracking (200)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/tracking/trips/${tripId}`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(200);

      expect(res.body.trip_id).toBe(tripId);
      expect(res.body.trip_number).toBe('TRIP-DEL-JPR-101');
      expect(res.body.trip_status).toBe('IN_TRANSIT');
    });

    it('returns 404 for non-existent trip ID', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/tracking/trips/99999999-9999-4999-a999-999999999999')
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(404);
    });
  });
});
