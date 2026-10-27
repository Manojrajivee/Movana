import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { DatabaseService } from '../src/database/database.service';
import { RedisService } from '../src/redis/redis.service';
import { DriverOperationsRepository } from '../src/driver-operations/repositories/driver-operations.repository';
import { DriversRepository } from '../src/drivers/repositories/drivers.repository';
import { FleetRepository } from '../src/fleet/repositories/fleet.repository';

describe('Driver Operations (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let adminToken: string;
  let operatorToken: string;
  let safetyOfficerToken: string;
  let driverToken: string;
  let otherDriverToken: string;
  let passengerToken: string;

  const adminUserId = '11111111-1111-4111-a111-111111111111';
  const operatorUserId = '22222222-2222-4222-a222-222222222222';
  const safetyOfficerUserId = '33333333-3333-4333-a333-333333333333';
  const driverUserId = '44444444-4444-4444-a444-444444444444';
  const otherDriverUserId = '55555555-5555-4555-a555-555555555555';
  const passengerUserId = '66666666-6666-4666-a666-666666666666';

  const driverId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
  const otherDriverId = 'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb';
  const vehicleId = 'cccccccc-cccc-4ccc-accc-cccccccccccc';
  const assignmentId = 'dddddddd-dddd-4ddd-addd-dddddddddddd';
  const safetyEventId = 'eeeeeeee-eeee-4eee-aeee-eeeeeeeeeeee';

  const mockDriver: any = {
    id: driverId,
    userId: driverUserId,
    employeeCode: 'EMP-777',
    licenseNumber: 'DL-777',
    employmentStatus: 'ACTIVE',
    verificationStatus: 'VERIFIED',
  };

  const mockOtherDriver: any = {
    id: otherDriverId,
    userId: otherDriverUserId,
    employeeCode: 'EMP-888',
    licenseNumber: 'DL-888',
    employmentStatus: 'ACTIVE',
    verificationStatus: 'VERIFIED',
  };

  const mockVehicle: any = {
    id: vehicleId,
    registration_number: 'KA-01-EQ-7777',
    vehicle_code: 'BUS-777',
    status: 'ACTIVE',
  };

  const mockAssignment: any = {
    id: assignmentId,
    driver_id: driverId,
    vehicle_id: vehicleId,
    trip_id: null,
    assignment_type: 'REGULAR_SHIFT',
    start_at: new Date(Date.now() - 4 * 3600 * 1000),
    end_at: null,
    status: 'SCHEDULED',
    assigned_by: operatorUserId,
    created_at: new Date(),
    updated_at: new Date(),
    vehicle_registration_number: 'KA-01-EQ-7777',
    vehicle_code: 'BUS-777',
    driver_employee_code: 'EMP-777',
    driver_license_number: 'DL-777',
  };

  const mockSafetyEvent: any = {
    id: safetyEventId,
    driver_id: driverId,
    vehicle_id: vehicleId,
    trip_id: null,
    event_type: 'HARSH_BRAKING',
    severity: 'MEDIUM',
    speed_kmh: 45.0,
    latitude: 12.9716,
    longitude: 77.5946,
    event_data: { gForce: 0.65 },
    occurred_at: new Date(),
    created_at: new Date(),
    driver_employee_code: 'EMP-777',
    vehicle_registration_number: 'KA-01-EQ-7777',
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

  const mockDriverOpsRepo = {
    findActiveDutyAssignment: jest.fn().mockResolvedValue(null),
    findAssignmentById: jest.fn().mockImplementation((id: string) => {
      if (id === assignmentId) return Promise.resolve(mockAssignment);
      return Promise.resolve(null);
    }),
    updateDutyStatus: jest.fn().mockImplementation((id: string, status: string, endAt?: Date) => {
      if (id === assignmentId) {
        return Promise.resolve({ ...mockAssignment, status, end_at: endAt ?? null });
      }
      return Promise.resolve(null);
    }),
    findDutyHistory: jest.fn().mockResolvedValue({
      history: [mockAssignment],
      total: 1,
    }),
    getDriverHoursSummary: jest.fn().mockResolvedValue({
      driver_id: driverId,
      hours_last_24h: 4.0,
      hours_last_7d: 28.0,
      total_completed_shifts: 4,
    }),
    createSafetyEvent: jest.fn().mockResolvedValue(mockSafetyEvent),
    findSafetyEvents: jest.fn().mockResolvedValue({
      events: [mockSafetyEvent],
      total: 1,
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

  const mockFleetRepo = {
    findVehicleById: jest.fn().mockImplementation((id: string) => {
      if (id === vehicleId) return Promise.resolve(mockVehicle);
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
      .overrideProvider(DriverOperationsRepository)
      .useValue(mockDriverOpsRepo)
      .overrideProvider(DriversRepository)
      .useValue(mockDriversRepo)
      .overrideProvider(FleetRepository)
      .useValue(mockFleetRepo)
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
    operatorToken = jwtService.sign({
      sub: operatorUserId,
      email: 'operator@movana.test',
      roles: ['OPERATOR'],
      permissions: ['dispatch:manage'],
    });
    safetyOfficerToken = jwtService.sign({
      sub: safetyOfficerUserId,
      email: 'safety@movana.test',
      roles: ['SAFETY_OFFICER'],
      permissions: ['safety:manage'],
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

  describe('Security & Access Controls', () => {
    it('should return 401 Unauthorized when unauthenticated', async () => {
      await request(app.getHttpServer()).get('/api/v1/driver-operations/duty/current').expect(401);
    });

    it('should return 403 Forbidden when passenger attempts to start duty', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/driver-operations/duty/start')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({ assignmentId })
        .expect(403);
    });

    it('should return 403 Forbidden when driver attempts to start another driver duty', async () => {
      mockDriverOpsRepo.findAssignmentById.mockResolvedValue(mockAssignment);
      mockDriversRepo.findByUserId.mockResolvedValue(mockOtherDriver);

      await request(app.getHttpServer())
        .post('/api/v1/driver-operations/duty/start')
        .set('Authorization', `Bearer ${otherDriverToken}`)
        .send({ assignmentId })
        .expect(403);
    });
  });

  describe('Duty Management Workflow', () => {
    it('should start duty shift with 200 OK for driver', async () => {
      mockDriverOpsRepo.findAssignmentById.mockResolvedValue(mockAssignment);
      mockDriversRepo.findByUserId.mockResolvedValue(mockDriver);
      mockDriverOpsRepo.findActiveDutyAssignment.mockResolvedValue(null);
      mockDriverOpsRepo.updateDutyStatus.mockResolvedValue({
        ...mockAssignment,
        status: 'ACTIVE',
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/driver-operations/duty/start')
        .set('Authorization', `Bearer ${driverToken}`)
        .send({ assignmentId })
        .expect(200);

      expect(res.body.status).toBe('ACTIVE');
    });

    it('should end duty shift and calculate hours with 200 OK', async () => {
      const activeDuty = {
        ...mockAssignment,
        status: 'ACTIVE',
        start_at: new Date(Date.now() - 5 * 3600 * 1000),
      };
      mockDriverOpsRepo.findAssignmentById.mockResolvedValue(activeDuty);
      mockDriversRepo.findByUserId.mockResolvedValue(mockDriver);
      mockDriverOpsRepo.updateDutyStatus.mockResolvedValue({
        ...activeDuty,
        status: 'COMPLETED',
        end_at: new Date(),
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/driver-operations/duty/end')
        .set('Authorization', `Bearer ${driverToken}`)
        .send({ assignmentId, notes: 'Shift completed with zero incidents' })
        .expect(200);

      expect(res.body.assignment.status).toBe('COMPLETED');
      expect(res.body.hoursExceeded).toBe(false);
      expect(res.body.durationHours).toBeGreaterThanOrEqual(4.9);
    });

    it('should return current active duty with 200 OK', async () => {
      mockDriversRepo.findByUserId.mockResolvedValue(mockDriver);
      mockDriverOpsRepo.findActiveDutyAssignment.mockResolvedValue({
        ...mockAssignment,
        status: 'ACTIVE',
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/driver-operations/duty/current')
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(200);

      expect(res.body.status).toBe('ACTIVE');
      expect(res.body.driver_id).toBe(driverId);
    });

    it('should return duty history and HOS summary with 200 OK', async () => {
      mockDriversRepo.findByUserId.mockResolvedValue(mockDriver);
      mockDriverOpsRepo.findDutyHistory.mockResolvedValue({
        history: [mockAssignment],
        total: 1,
      });
      mockDriverOpsRepo.getDriverHoursSummary.mockResolvedValue({
        driver_id: driverId,
        hours_last_24h: 4.0,
        hours_last_7d: 28.0,
        total_completed_shifts: 4,
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/driver-operations/duty/history')
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(200);

      expect(res.body.total).toBe(1);
      expect(res.body.summary.hours_last_24h).toBe(4.0);
    });

    it('should allow ADMIN to query driver duty history by driverId with 200 OK', async () => {
      mockDriverOpsRepo.findDutyHistory.mockResolvedValue({
        history: [mockAssignment],
        total: 1,
      });
      mockDriverOpsRepo.getDriverHoursSummary.mockResolvedValue({
        driver_id: driverId,
        hours_last_24h: 4.0,
        hours_last_7d: 28.0,
        total_completed_shifts: 4,
      });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/driver-operations/duty/history?driverId=${driverId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.total).toBe(1);
    });
  });

  describe('Driver Safety & Telematics Infractions', () => {
    it('should record telematics safety event with 201 Created for SAFETY_OFFICER', async () => {
      mockDriversRepo.findById.mockResolvedValue(mockDriver);
      mockFleetRepo.findVehicleById.mockResolvedValue(mockVehicle);
      mockDriverOpsRepo.createSafetyEvent.mockResolvedValue(mockSafetyEvent);

      const res = await request(app.getHttpServer())
        .post('/api/v1/driver-operations/safety-events')
        .set('Authorization', `Bearer ${safetyOfficerToken}`)
        .send({
          driverId,
          vehicleId,
          eventType: 'HARSH_BRAKING',
          severity: 'MEDIUM',
          speedKmh: 45.0,
          latitude: 12.9716,
          longitude: 77.5946,
          occurredAt: '2026-11-01T10:00:00Z',
          eventData: { gForce: 0.65 },
        })
        .expect(201);

      expect(res.body.id).toBe(safetyEventId);
      expect(res.body.event_type).toBe('HARSH_BRAKING');
    });

    it('should return 403 Forbidden when passenger attempts to record safety event', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/driver-operations/safety-events')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({
          driverId,
          vehicleId,
          eventType: 'HARSH_BRAKING',
        })
        .expect(403);
    });

    it('should query safety events with 200 OK for OPERATOR', async () => {
      mockDriverOpsRepo.findSafetyEvents.mockResolvedValue({
        events: [mockSafetyEvent],
        total: 1,
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/driver-operations/safety-events')
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(200);

      expect(res.body.total).toBe(1);
      expect(res.body.events[0].id).toBe(safetyEventId);
    });
  });
});
