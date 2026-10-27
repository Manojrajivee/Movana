import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { DatabaseService } from '../src/database/database.service';
import { RedisService } from '../src/redis/redis.service';
import { FleetRepository } from '../src/fleet/repositories/fleet.repository';

describe('Fleet & Buses (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let adminToken: string;
  let fleetManagerToken: string;
  let driverToken: string;
  let passengerToken: string;

  const adminUserId = '11111111-1111-4111-a111-111111111111';
  const fleetManagerUserId = '22222222-2222-4222-a222-222222222222';
  const driverUserId = '33333333-3333-4333-a333-333333333333';
  const passengerUserId = '44444444-4444-4444-a444-444444444444';

  const typeId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
  const manufacturerId = 'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb';
  const modelId = 'cccccccc-cccc-4ccc-accc-cccccccccccc';
  const vehicleId = 'dddddddd-dddd-4ddd-addd-dddddddddddd';

  const mockType: any = {
    id: typeId,
    code: 'CITY_AC',
    name: 'Air Conditioned City Bus',
    description: 'Urban luxury transit',
    default_fare_multiplier: 1.25,
    is_active: true,
  };

  const mockManufacturer: any = {
    id: manufacturerId,
    name: 'Tata Motors',
    country: 'India',
    website: 'https://tatamotors.com',
  };

  const mockModel: any = {
    id: modelId,
    manufacturer_id: manufacturerId,
    name: 'Starbus EV',
    release_year: 2024,
    default_capacity: 45,
  };

  const mockVehicle: any = {
    id: vehicleId,
    registration_number: 'KA-01-EQ-9999',
    vehicle_code: 'BUS-999',
    vehicle_type_id: typeId,
    manufacturer_id: manufacturerId,
    model_id: modelId,
    model_year: 2024,
    vin: '1TATA987654321001',
    engine_number: 'ENG-112233',
    capacity: 45,
    standing_capacity: 15,
    seat_capacity: 30,
    fuel_type: 'ELECTRIC',
    status: 'ACTIVE',
    current_odometer: 150.0,
    current_latitude: null,
    current_longitude: null,
    last_location_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    deleted_at: null,
    manufacturer_name: 'Tata Motors',
    model_name: 'Starbus EV',
    type_name: 'Air Conditioned City Bus',
    type_code: 'CITY_AC',
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

  const mockFleetRepo = {
    findVehicleTypes: jest.fn().mockResolvedValue([mockType]),
    findVehicleTypeById: jest.fn().mockImplementation((id: string) => {
      if (id === typeId) return Promise.resolve(mockType);
      return Promise.resolve(null);
    }),
    findManufacturers: jest.fn().mockResolvedValue([mockManufacturer]),
    findManufacturerById: jest.fn().mockImplementation((id: string) => {
      if (id === manufacturerId) return Promise.resolve(mockManufacturer);
      return Promise.resolve(null);
    }),
    findVehicleModels: jest.fn().mockResolvedValue([mockModel]),
    findVehicleModelById: jest.fn().mockImplementation((id: string) => {
      if (id === modelId) return Promise.resolve(mockModel);
      return Promise.resolve(null);
    }),
    createVehicle: jest.fn().mockResolvedValue(mockVehicle),
    findVehicleById: jest.fn().mockImplementation((id: string) => {
      if (id === vehicleId) return Promise.resolve(mockVehicle);
      return Promise.resolve(null);
    }),
    findVehicleByRegistrationNumber: jest.fn().mockResolvedValue(null),
    findVehicleByCode: jest.fn().mockResolvedValue(null),
    findVehicleByVin: jest.fn().mockResolvedValue(null),
    findVehicles: jest.fn().mockResolvedValue({
      vehicles: [mockVehicle],
      total: 1,
    }),
    updateVehicle: jest.fn().mockImplementation((id: string, data: any) => {
      return Promise.resolve({ ...mockVehicle, id, ...data });
    }),
    updateVehicleStatus: jest.fn().mockImplementation((id: string, status: string) => {
      return Promise.resolve({ ...mockVehicle, id, status });
    }),
    recordStatusHistory: jest.fn().mockResolvedValue(undefined),
    updateTelemetry: jest.fn().mockImplementation((id: string, lat: number, lon: number) => {
      return Promise.resolve({
        ...mockVehicle,
        id,
        current_latitude: lat,
        current_longitude: lon,
      });
    }),
    softDeleteVehicle: jest.fn().mockResolvedValue({
      ...mockVehicle,
      status: 'DECOMMISSIONED',
      deleted_at: new Date(),
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
      .overrideProvider(FleetRepository)
      .useValue(mockFleetRepo)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    jwtService = moduleFixture.get<JwtService>(JwtService);

    adminToken = jwtService.sign({
      sub: adminUserId,
      email: 'admin@movana.internal',
      roles: ['ADMIN'],
      permissions: [],
    });

    fleetManagerToken = jwtService.sign({
      sub: fleetManagerUserId,
      email: 'fleet@movana.internal',
      roles: ['FLEET_MANAGER'],
      permissions: [],
    });

    driverToken = jwtService.sign({
      sub: driverUserId,
      email: 'driver@movana.internal',
      roles: ['DRIVER'],
      permissions: [],
    });

    passengerToken = jwtService.sign({
      sub: passengerUserId,
      email: 'passenger@movana.internal',
      roles: ['PASSENGER'],
      permissions: [],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Reference Data', () => {
    it('GET /api/v1/vehicles/types - should return vehicle types list (200 OK)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/vehicles/types')
        .set('Authorization', `Bearer ${fleetManagerToken}`)
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].code).toBe('CITY_AC');
    });

    it('GET /api/v1/vehicles/models - should return vehicle models list (200 OK)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/vehicles/models')
        .set('Authorization', `Bearer ${fleetManagerToken}`)
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe('Starbus EV');
    });
  });

  describe('POST /api/v1/vehicles', () => {
    const payload = {
      registrationNumber: 'KA-01-EQ-9999',
      vehicleCode: 'BUS-999',
      vehicleTypeId: typeId,
      manufacturerId,
      modelId,
      modelYear: 2024,
      vin: '1TATA987654321001',
      engineNumber: 'ENG-112233',
      seatCapacity: 30,
      standingCapacity: 15,
      capacity: 45,
      fuelType: 'ELECTRIC',
      currentOdometer: 150.0,
    };

    it('should reject unauthenticated request (401 Unauthorized)', async () => {
      await request(app.getHttpServer()).post('/api/v1/vehicles').send(payload).expect(401);
    });

    it('should reject passenger role from creating vehicle (403 Forbidden)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/vehicles')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send(payload)
        .expect(403);
    });

    it('should reject when capacity does not match seat + standing (400 Bad Request)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/vehicles')
        .set('Authorization', `Bearer ${fleetManagerToken}`)
        .send({
          ...payload,
          capacity: 100, // Invariant violation (30 + 15 != 100)
        })
        .expect(400);
    });

    it('should reject duplicate registration number (409 Conflict)', async () => {
      mockFleetRepo.findVehicleByRegistrationNumber.mockResolvedValueOnce(mockVehicle);

      await request(app.getHttpServer())
        .post('/api/v1/vehicles')
        .set('Authorization', `Bearer ${fleetManagerToken}`)
        .send(payload)
        .expect(409);
    });

    it('should create vehicle successfully for fleet manager (201 Created)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/vehicles')
        .set('Authorization', `Bearer ${fleetManagerToken}`)
        .send(payload)
        .expect(201);

      expect(res.body.id).toBe(vehicleId);
      expect(res.body.registration_number).toBe('KA-01-EQ-9999');
    });
  });

  describe('GET /api/v1/vehicles', () => {
    it('should list vehicles inventory (200 OK)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/vehicles')
        .set('Authorization', `Bearer ${fleetManagerToken}`)
        .expect(200);

      expect(res.body.vehicles).toHaveLength(1);
      expect(res.body.total).toBe(1);
    });
  });

  describe('GET /api/v1/vehicles/:id', () => {
    it('should return 404 for unknown vehicle ID', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/vehicles/00000000-0000-4000-a000-000000000000')
        .set('Authorization', `Bearer ${fleetManagerToken}`)
        .expect(404);
    });

    it('should return vehicle details by ID (200 OK)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/vehicles/${vehicleId}`)
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(200);

      expect(res.body.id).toBe(vehicleId);
      expect(res.body.vehicle_code).toBe('BUS-999');
    });
  });

  describe('PATCH /api/v1/vehicles/:id', () => {
    it('should reject driver from editing vehicle specifications (403 Forbidden)', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/vehicles/${vehicleId}`)
        .set('Authorization', `Bearer ${driverToken}`)
        .send({ seatCapacity: 32 })
        .expect(403);
    });

    it('should allow fleet manager to update vehicle specs (200 OK)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/vehicles/${vehicleId}`)
        .set('Authorization', `Bearer ${fleetManagerToken}`)
        .send({ seatCapacity: 32, standingCapacity: 15, capacity: 47 })
        .expect(200);

      expect(res.body.id).toBe(vehicleId);
    });
  });

  describe('PATCH /api/v1/vehicles/:id/status', () => {
    it('should reject status transition from DECOMMISSIONED (400 Bad Request)', async () => {
      mockFleetRepo.findVehicleById.mockResolvedValueOnce({
        ...mockVehicle,
        status: 'DECOMMISSIONED',
      });

      await request(app.getHttpServer())
        .patch(`/api/v1/vehicles/${vehicleId}/status`)
        .set('Authorization', `Bearer ${fleetManagerToken}`)
        .send({ status: 'ACTIVE', reason: 'Reactivation attempt' })
        .expect(400);
    });

    it('should update vehicle status (200 OK)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/vehicles/${vehicleId}/status`)
        .set('Authorization', `Bearer ${fleetManagerToken}`)
        .send({ status: 'MAINTENANCE', reason: 'Regular scheduled inspection' })
        .expect(200);

      expect(res.body.status).toBe('MAINTENANCE');
    });
  });

  describe('PATCH /api/v1/vehicles/:id/telemetry', () => {
    it('should reject out-of-range coordinates (400 Bad Request)', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/vehicles/${vehicleId}/telemetry`)
        .set('Authorization', `Bearer ${driverToken}`)
        .send({ latitude: 150.0, longitude: 77.0 })
        .expect(400);
    });

    it('should update coordinates successfully (200 OK)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/vehicles/${vehicleId}/telemetry`)
        .set('Authorization', `Bearer ${driverToken}`)
        .send({ latitude: 12.9716, longitude: 77.5946, odometer: 160.0 })
        .expect(200);

      expect(res.body.current_latitude).toBe(12.9716);
      expect(res.body.current_longitude).toBe(77.5946);
    });
  });

  describe('DELETE /api/v1/vehicles/:id', () => {
    it('should reject driver from deleting vehicle (403 Forbidden)', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/vehicles/${vehicleId}`)
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(403);
    });

    it('should allow admin to soft delete vehicle (204 No Content)', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/vehicles/${vehicleId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);
    });
  });
});
