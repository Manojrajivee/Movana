import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { DatabaseService } from '../src/database/database.service';
import { RedisService } from '../src/redis/redis.service';
import { FleetOperationsRepository } from '../src/fleet-operations/repositories/fleet-operations.repository';
import { FleetRepository } from '../src/fleet/repositories/fleet.repository';
import { DriversRepository } from '../src/drivers/repositories/drivers.repository';

describe('Fleet Operations (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let adminToken: string;
  let fleetManagerToken: string;
  let operatorToken: string;
  let driverToken: string;
  let otherDriverToken: string;
  let passengerToken: string;

  const adminUserId = '11111111-1111-4111-a111-111111111111';
  const fleetManagerUserId = '22222222-2222-4222-a222-222222222222';
  const operatorUserId = '33333333-3333-4333-a333-333333333333';
  const driverUserId = '44444444-4444-4444-a444-444444444444';
  const otherDriverUserId = '55555555-5555-4555-a555-555555555555';
  const passengerUserId = '66666666-6666-4666-a666-666666666666';

  const vehicleId = '77777777-7777-4777-a777-777777777777';
  const driverId = '88888888-8888-4888-a888-888888888888';
  const otherDriverId = '99999999-9999-4999-a999-999999999999';
  const assignmentId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';

  const mockVehicle: any = {
    id: vehicleId,
    registration_number: 'KA-01-EQ-5555',
    vehicle_code: 'BUS-555',
    status: 'ACTIVE',
    deleted_at: null,
  };

  const mockDriver: any = {
    id: driverId,
    userId: driverUserId,
    employeeCode: 'EMP-555',
    licenseNumber: 'DL-555',
    licenseExpiryDate: '2030-12-31',
    employmentStatus: 'ACTIVE',
    verificationStatus: 'VERIFIED',
  };

  const mockOtherDriver: any = {
    id: otherDriverId,
    userId: otherDriverUserId,
    employeeCode: 'EMP-666',
    licenseNumber: 'DL-666',
    licenseExpiryDate: '2030-12-31',
    employmentStatus: 'ACTIVE',
    verificationStatus: 'VERIFIED',
  };

  const mockAssignment: any = {
    id: assignmentId,
    vehicle_id: vehicleId,
    driver_id: driverId,
    trip_id: null,
    assignment_type: 'TRIP',
    start_at: new Date('2026-11-01T08:00:00Z'),
    end_at: new Date('2026-11-01T16:00:00Z'),
    status: 'SCHEDULED',
    assigned_by: fleetManagerUserId,
    created_at: new Date(),
    updated_at: new Date(),
    vehicle_registration_number: 'KA-01-EQ-5555',
    vehicle_code: 'BUS-555',
    driver_employee_code: 'EMP-555',
    driver_license_number: 'DL-555',
    driver_first_name: 'John',
    driver_last_name: 'Driver',
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

  const mockFleetOpsRepo = {
    createVehicleAssignment: jest.fn().mockResolvedValue(mockAssignment),
    findConflictingVehicleAssignment: jest.fn().mockResolvedValue(null),
    findAssignmentById: jest.fn().mockImplementation((id: string) => {
      if (id === assignmentId) return Promise.resolve(mockAssignment);
      return Promise.resolve(null);
    }),
    findAssignments: jest.fn().mockResolvedValue({
      assignments: [mockAssignment],
      total: 1,
    }),
    updateAssignmentStatus: jest.fn().mockImplementation((id: string, status: string) => {
      if (id === assignmentId) {
        return Promise.resolve({ ...mockAssignment, status });
      }
      return Promise.resolve(null);
    }),
    findVehicleStatusHistory: jest.fn().mockResolvedValue({
      history: [
        {
          id: 'vsh-1',
          vehicle_id: vehicleId,
          old_status: 'MAINTENANCE',
          new_status: 'ACTIVE',
          reason: 'Routine servicing completed',
          changed_by: adminUserId,
          created_at: new Date(),
          changed_by_name: 'Admin User',
        },
      ],
      total: 1,
    }),
    getFleetSummary: jest.fn().mockResolvedValue({
      total_vehicles: 25,
      active_vehicles: 20,
      maintenance_vehicles: 3,
      reserved_vehicles: 2,
      decommissioned_vehicles: 0,
      active_assignments: 12,
    }),
    getActiveVehicleAssignment: jest.fn().mockResolvedValue(null),
  };

  const mockFleetRepo = {
    findVehicleById: jest.fn().mockImplementation((id: string) => {
      if (id === vehicleId) return Promise.resolve(mockVehicle);
      return Promise.resolve(null);
    }),
  };

  const mockDriversRepo = {
    findById: jest.fn().mockImplementation((id: string) => {
      if (id === driverId) return Promise.resolve(mockDriver);
      if (id === otherDriverId) return Promise.resolve(mockOtherDriver);
      return Promise.resolve(null);
    }),
    findByUserId: jest.fn().mockImplementation((userId: string) => {
      if (userId === driverUserId) return Promise.resolve(mockDriver);
      if (userId === otherDriverUserId) return Promise.resolve(mockOtherDriver);
      return Promise.resolve(null);
    }),
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
      .overrideProvider(FleetOperationsRepository)
      .useValue(mockFleetOpsRepo)
      .overrideProvider(FleetRepository)
      .useValue(mockFleetRepo)
      .overrideProvider(DriversRepository)
      .useValue(mockDriversRepo)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    jwtService = moduleFixture.get<JwtService>(JwtService);

    adminToken = jwtService.sign({
      sub: adminUserId,
      email: 'admin@movana.test',
      roles: ['ADMIN'],
      permissions: ['*'],
    });
    fleetManagerToken = jwtService.sign({
      sub: fleetManagerUserId,
      email: 'fleet@movana.test',
      roles: ['FLEET_MANAGER'],
      permissions: ['fleet:manage'],
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
    otherDriverToken = jwtService.sign({
      sub: otherDriverUserId,
      email: 'otherdriver@movana.test',
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

  describe('Security & Authentication', () => {
    it('should return 401 Unauthorized when no JWT is provided', async () => {
      await request(app.getHttpServer()).get('/api/v1/fleet-operations/assignments').expect(401);
    });

    it('should return 403 Forbidden when passenger attempts to dispatch vehicle', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/fleet-operations/assignments')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({
          vehicleId,
          driverId,
          assignmentType: 'TRIP',
          startAt: '2026-11-01T08:00:00Z',
        })
        .expect(403);
    });

    it('should return 403 Forbidden when passenger attempts to view summary', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/summary')
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(403);
    });
  });

  describe('POST /api/v1/fleet-operations/assignments', () => {
    it('should create vehicle assignment with 201 Created for FLEET_MANAGER', async () => {
      mockFleetRepo.findVehicleById.mockResolvedValue(mockVehicle);
      mockDriversRepo.findById.mockResolvedValue(mockDriver);
      mockFleetOpsRepo.findConflictingVehicleAssignment.mockResolvedValue(null);
      mockFleetOpsRepo.createVehicleAssignment.mockResolvedValue(mockAssignment);

      const res = await request(app.getHttpServer())
        .post('/api/v1/fleet-operations/assignments')
        .set('Authorization', `Bearer ${fleetManagerToken}`)
        .send({
          vehicleId,
          driverId,
          assignmentType: 'TRIP',
          startAt: '2026-11-01T08:00:00Z',
          endAt: '2026-11-01T16:00:00Z',
        })
        .expect(201);

      expect(res.body.id).toBe(assignmentId);
      expect(res.body.status).toBe('SCHEDULED');
    });

    it('should return 400 Bad Request on invalid endAt (before startAt)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/fleet-operations/assignments')
        .set('Authorization', `Bearer ${fleetManagerToken}`)
        .send({
          vehicleId,
          driverId,
          assignmentType: 'TRIP',
          startAt: '2026-11-01T16:00:00Z',
          endAt: '2026-11-01T08:00:00Z',
        })
        .expect(400);
    });

    it('should return 409 Conflict when vehicle is already assigned', async () => {
      mockFleetRepo.findVehicleById.mockResolvedValue(mockVehicle);
      mockDriversRepo.findById.mockResolvedValue(mockDriver);
      mockFleetOpsRepo.findConflictingVehicleAssignment.mockResolvedValue(mockAssignment);

      await request(app.getHttpServer())
        .post('/api/v1/fleet-operations/assignments')
        .set('Authorization', `Bearer ${fleetManagerToken}`)
        .send({
          vehicleId,
          driverId,
          assignmentType: 'TRIP',
          startAt: '2026-11-01T08:00:00Z',
        })
        .expect(409);
    });
  });

  describe('GET /api/v1/fleet-operations/assignments', () => {
    it('should return assignments list with 200 OK for OPERATOR', async () => {
      mockFleetOpsRepo.findAssignments.mockResolvedValue({
        assignments: [mockAssignment],
        total: 1,
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/assignments')
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(200);

      expect(res.body.total).toBe(1);
      expect(res.body.assignments[0].id).toBe(assignmentId);
    });

    it('should allow DRIVER to query own assignments', async () => {
      mockDriversRepo.findByUserId.mockResolvedValue(mockDriver);
      mockFleetOpsRepo.findAssignments.mockResolvedValue({
        assignments: [mockAssignment],
        total: 1,
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/assignments')
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(200);

      expect(res.body.total).toBe(1);
      expect(mockFleetOpsRepo.findAssignments).toHaveBeenCalledWith(
        expect.objectContaining({ driverId }),
      );
    });
  });

  describe('GET /api/v1/fleet-operations/assignments/:id', () => {
    it('should return assignment by ID for FLEET_MANAGER', async () => {
      mockFleetOpsRepo.findAssignmentById.mockResolvedValue(mockAssignment);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/fleet-operations/assignments/${assignmentId}`)
        .set('Authorization', `Bearer ${fleetManagerToken}`)
        .expect(200);

      expect(res.body.id).toBe(assignmentId);
    });

    it('should return 403 Forbidden when driver attempts to view another driver assignment', async () => {
      mockFleetOpsRepo.findAssignmentById.mockResolvedValue(mockAssignment);
      mockDriversRepo.findByUserId.mockResolvedValue(mockOtherDriver);

      await request(app.getHttpServer())
        .get(`/api/v1/fleet-operations/assignments/${assignmentId}`)
        .set('Authorization', `Bearer ${otherDriverToken}`)
        .expect(403);
    });
  });

  describe('PATCH /api/v1/fleet-operations/assignments/:id/status', () => {
    it('should allow OPERATOR to transition SCHEDULED to ACTIVE', async () => {
      mockFleetOpsRepo.findAssignmentById.mockResolvedValue(mockAssignment);
      mockFleetOpsRepo.updateAssignmentStatus.mockResolvedValue({
        ...mockAssignment,
        status: 'ACTIVE',
      });

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/fleet-operations/assignments/${assignmentId}/status`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({ status: 'ACTIVE' })
        .expect(200);

      expect(res.body.status).toBe('ACTIVE');
    });

    it('should return 403 Forbidden when driver attempts to cancel assignment', async () => {
      mockFleetOpsRepo.findAssignmentById.mockResolvedValue(mockAssignment);
      mockDriversRepo.findByUserId.mockResolvedValue(mockDriver);

      await request(app.getHttpServer())
        .patch(`/api/v1/fleet-operations/assignments/${assignmentId}/status`)
        .set('Authorization', `Bearer ${driverToken}`)
        .send({ status: 'CANCELLED' })
        .expect(403);
    });
  });

  describe('GET /api/v1/fleet-operations/vehicles/:id/readiness', () => {
    it('should return vehicle readiness assessment with 200 OK', async () => {
      mockFleetRepo.findVehicleById.mockResolvedValue(mockVehicle);
      mockFleetOpsRepo.getActiveVehicleAssignment.mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/fleet-operations/vehicles/${vehicleId}/readiness`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(200);

      expect(res.body.isReady).toBe(true);
      expect(res.body.vehicleCode).toBe('BUS-555');
    });
  });

  describe('GET /api/v1/fleet-operations/vehicles/:id/status-history', () => {
    it('should return vehicle status history with 200 OK', async () => {
      mockFleetRepo.findVehicleById.mockResolvedValue(mockVehicle);
      mockFleetOpsRepo.findVehicleStatusHistory.mockResolvedValue({
        history: [
          {
            id: 'vsh-1',
            vehicle_id: vehicleId,
            old_status: 'MAINTENANCE',
            new_status: 'ACTIVE',
            reason: 'Routine servicing completed',
            changed_by: adminUserId,
            created_at: new Date(),
          },
        ],
        total: 1,
      });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/fleet-operations/vehicles/${vehicleId}/status-history`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.total).toBe(1);
    });
  });

  describe('GET /api/v1/fleet-operations/summary', () => {
    it('should return fleet operational summary with 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/fleet-operations/summary')
        .set('Authorization', `Bearer ${fleetManagerToken}`)
        .expect(200);

      expect(res.body.total_vehicles).toBe(25);
      expect(res.body.active_vehicles).toBe(20);
    });
  });
});
