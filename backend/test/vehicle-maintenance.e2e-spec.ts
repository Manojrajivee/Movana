import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { DatabaseService } from '../src/database/database.service';
import { RedisService } from '../src/redis/redis.service';
import { VehicleMaintenanceRepository } from '../src/vehicle-maintenance/repositories/vehicle-maintenance.repository';
import { FleetRepository } from '../src/fleet/repositories/fleet.repository';

describe('Vehicle Maintenance (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let fleetManagerToken: string;
  let operatorToken: string;
  let driverToken: string;
  let passengerToken: string;

  const fleetManagerUserId = '11111111-1111-4111-a111-111111111111';
  const operatorUserId = '22222222-2222-4222-a222-222222222222';
  const driverUserId = '33333333-3333-4333-a333-333333333333';
  const passengerUserId = '44444444-4444-4444-a444-444444444444';

  const vehicleId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
  const scheduleId = 'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb';
  const recordId = 'cccccccc-cccc-4ccc-accc-cccccccccccc';
  const inspectionId = 'dddddddd-dddd-4ddd-addd-dddddddddddd';

  const mockVehicle: any = {
    id: vehicleId,
    registration_number: 'KA-01-EQ-8888',
    vehicle_code: 'BUS-888',
    status: 'ACTIVE',
    current_odometer: 25000.0,
  };

  const mockSchedule: any = {
    id: scheduleId,
    service_name: 'Engine Oil and Filter Service',
    vehicle_id: vehicleId,
    vehicle_type_id: null,
    interval_km: 10000,
    interval_days: 90,
    description: 'Quarterly lubrication service',
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
    vehicle_registration_number: 'KA-01-EQ-8888',
  };

  const mockRecord: any = {
    id: recordId,
    vehicle_id: vehicleId,
    maintenance_type: 'SCHEDULED',
    scheduled_date: '2026-11-20',
    completed_date: null,
    odometer: 25100.0,
    cost: 5500.0,
    currency: 'INR',
    vendor: 'Tata Commercial Service Hub',
    description: 'Scheduled fluid exchange and brake line pressure test',
    technician: 'Suresh Patel',
    next_due_date: '2027-02-20',
    status: 'SCHEDULED',
    created_at: new Date(),
    updated_at: new Date(),
    vehicle_registration_number: 'KA-01-EQ-8888',
    vehicle_code: 'BUS-888',
  };

  const mockInspection: any = {
    id: inspectionId,
    vehicle_id: vehicleId,
    inspection_type: 'PRE_TRIP',
    inspector_id: driverUserId,
    trip_id: null,
    inspection_date: new Date(),
    status: 'PASSED',
    odometer: 25150.0,
    notes: 'All mirrors, wipers, brakes, and headlights tested normal',
    created_at: new Date(),
    updated_at: new Date(),
    vehicle_registration_number: 'KA-01-EQ-8888',
    vehicle_code: 'BUS-888',
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

  const mockMaintRepo = {
    createSchedule: jest.fn().mockResolvedValue(mockSchedule),
    findSchedules: jest.fn().mockResolvedValue([mockSchedule]),
    findScheduleById: jest.fn().mockImplementation((id: string) => {
      if (id === scheduleId) return Promise.resolve(mockSchedule);
      return Promise.resolve(null);
    }),
    createRecord: jest.fn().mockResolvedValue(mockRecord),
    findRecords: jest.fn().mockResolvedValue({
      records: [mockRecord],
      total: 1,
    }),
    findRecordById: jest.fn().mockImplementation((id: string) => {
      if (id === recordId) return Promise.resolve(mockRecord);
      return Promise.resolve(null);
    }),
    updateRecordStatus: jest.fn().mockImplementation((id: string, status: string) => {
      if (id === recordId) {
        return Promise.resolve({ ...mockRecord, status });
      }
      return Promise.resolve(null);
    }),
    createInspection: jest.fn().mockResolvedValue(mockInspection),
    findInspections: jest.fn().mockResolvedValue({
      inspections: [mockInspection],
      total: 1,
    }),
    findInspectionById: jest.fn().mockImplementation((id: string) => {
      if (id === inspectionId) return Promise.resolve(mockInspection);
      return Promise.resolve(null);
    }),
  };

  const mockFleetRepo = {
    findVehicleById: jest.fn().mockImplementation((id: string) => {
      if (id === vehicleId) return Promise.resolve(mockVehicle);
      return Promise.resolve(null);
    }),
    findVehicleTypeById: jest.fn().mockResolvedValue(null),
    updateVehicleStatus: jest.fn().mockResolvedValue({ ...mockVehicle, status: 'MAINTENANCE' }),
    recordStatusHistory: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.APP_PORT = '3000';
    process.env.DATABASE_NAME = 'movana';
    process.env.DATABASE_USER = 'movana_app';
    process.env.DATABASE_PASSWORD = 'MockTestPasswordSecret123!';
    process.env.REDIS_REQUIRED_FOR_READY = 'false';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useValue(mockDatabaseService)
      .overrideProvider(RedisService)
      .useValue(mockRedisService)
      .overrideProvider(VehicleMaintenanceRepository)
      .useValue(mockMaintRepo)
      .overrideProvider(FleetRepository)
      .useValue(mockFleetRepo)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    jwtService = moduleFixture.get<JwtService>(JwtService);

    fleetManagerToken = jwtService.sign({
      sub: fleetManagerUserId,
      email: 'fleet@movana.test',
      roles: ['FLEET_MANAGER'],
      permissions: ['maintenance:manage'],
    });
    operatorToken = jwtService.sign({
      sub: operatorUserId,
      email: 'operator@movana.test',
      roles: ['OPERATOR'],
      permissions: ['dispatch:manage'],
    });
    driverToken = jwtService.sign({
      sub: driverUserId,
      email: 'driver@movana.test',
      roles: ['DRIVER'],
      permissions: ['driver:view'],
    });
    passengerToken = jwtService.sign({
      sub: passengerUserId,
      email: 'passenger@movana.test',
      roles: ['PASSENGER'],
      permissions: [],
    });
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Security & Access Controls', () => {
    it('should return 401 Unauthorized without token', async () => {
      await request(app.getHttpServer()).get('/api/v1/maintenance/schedules').expect(401);
    });

    it('should return 403 Forbidden when passenger attempts to create schedule', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/maintenance/schedules')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({
          serviceName: 'Oil Change',
          vehicleId,
          intervalKm: 10000,
          intervalDays: 90,
        })
        .expect(403);
    });
  });

  describe('Preventative Maintenance Schedules', () => {
    it('should create maintenance schedule with 201 Created for FLEET_MANAGER', async () => {
      mockFleetRepo.findVehicleById.mockResolvedValue(mockVehicle);
      mockMaintRepo.createSchedule.mockResolvedValue(mockSchedule);

      const res = await request(app.getHttpServer())
        .post('/api/v1/maintenance/schedules')
        .set('Authorization', `Bearer ${fleetManagerToken}`)
        .send({
          serviceName: 'Engine Oil and Filter Service',
          vehicleId,
          intervalKm: 10000,
          intervalDays: 90,
          description: 'Quarterly lubrication service',
        })
        .expect(201);

      expect(res.body.id).toBe(scheduleId);
      expect(res.body.service_name).toBe('Engine Oil and Filter Service');
    });

    it('should retrieve list of schedules with 200 OK for OPERATOR', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/maintenance/schedules')
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body[0].id).toBe(scheduleId);
    });

    it('should retrieve schedule by ID with 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/maintenance/schedules/${scheduleId}`)
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(200);

      expect(res.body.id).toBe(scheduleId);
    });
  });

  describe('Maintenance Work Orders & Records', () => {
    it('should create maintenance record with 201 Created for FLEET_MANAGER', async () => {
      mockFleetRepo.findVehicleById.mockResolvedValue(mockVehicle);
      mockMaintRepo.createRecord.mockResolvedValue(mockRecord);

      const res = await request(app.getHttpServer())
        .post('/api/v1/maintenance/records')
        .set('Authorization', `Bearer ${fleetManagerToken}`)
        .send({
          vehicleId,
          maintenanceType: 'SCHEDULED',
          scheduledDate: '2026-11-20',
          odometer: 25100.0,
          cost: 5500.0,
          currency: 'INR',
          vendor: 'Tata Commercial Service Hub',
          description: 'Scheduled fluid exchange and brake line pressure test',
          technician: 'Suresh Patel',
        })
        .expect(201);

      expect(res.body.id).toBe(recordId);
      expect(res.body.status).toBe('SCHEDULED');
    });

    it('should retrieve maintenance records list with 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/maintenance/records')
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(200);

      expect(res.body.total).toBe(1);
      expect(res.body.records[0].id).toBe(recordId);
    });

    it('should retrieve maintenance record by ID with 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/maintenance/records/${recordId}`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(200);

      expect(res.body.id).toBe(recordId);
    });

    it('should update record status to IN_PROGRESS with 200 OK', async () => {
      mockMaintRepo.findRecordById.mockResolvedValue(mockRecord);
      mockMaintRepo.updateRecordStatus.mockResolvedValue({
        ...mockRecord,
        status: 'IN_PROGRESS',
      });

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/maintenance/records/${recordId}/status`)
        .set('Authorization', `Bearer ${fleetManagerToken}`)
        .send({ status: 'IN_PROGRESS' })
        .expect(200);

      expect(res.body.status).toBe('IN_PROGRESS');
    });
  });

  describe('Vehicle Safety Inspections', () => {
    it('should record pre-trip inspection with 201 Created for DRIVER', async () => {
      mockFleetRepo.findVehicleById.mockResolvedValue(mockVehicle);
      mockMaintRepo.createInspection.mockResolvedValue(mockInspection);

      const res = await request(app.getHttpServer())
        .post('/api/v1/maintenance/inspections')
        .set('Authorization', `Bearer ${driverToken}`)
        .send({
          vehicleId,
          inspectionType: 'PRE_TRIP',
          status: 'PASSED',
          odometer: 25150.0,
          notes: 'All mirrors, wipers, brakes, and headlights tested normal',
        })
        .expect(201);

      expect(res.body.id).toBe(inspectionId);
      expect(res.body.status).toBe('PASSED');
    });

    it('should retrieve vehicle inspections list with 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/maintenance/inspections')
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(200);

      expect(res.body.total).toBe(1);
      expect(res.body.inspections[0].id).toBe(inspectionId);
    });

    it('should retrieve inspection by ID with 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/maintenance/inspections/${inspectionId}`)
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(200);

      expect(res.body.id).toBe(inspectionId);
    });
  });
});
