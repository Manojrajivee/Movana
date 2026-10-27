import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { DatabaseService } from '../src/database/database.service';
import { RedisService } from '../src/redis/redis.service';
import { DriversRepository } from '../src/drivers/repositories/drivers.repository';
import { DriverAssignmentsRepository } from '../src/drivers/repositories/driver-assignments.repository';

describe('Driver Assignments (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let adminToken: string;
  let operatorToken: string;
  let driverToken: string;
  let otherDriverToken: string;
  let passengerToken: string;

  const adminUserId = '11111111-1111-4111-a111-111111111111';
  const operatorUserId = '22222222-2222-4222-a222-222222222222';
  const driverUserId = '33333333-3333-4333-a333-333333333333';
  const otherDriverUserId = '44444444-4444-4444-a444-444444444444';
  const passengerUserId = '55555555-5555-4555-a555-555555555555';

  const driverId = 'dddddddd-dddd-4ddd-addd-dddddddddddd';
  const otherDriverId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
  const vehicleId = '77777777-7777-4777-a777-777777777777';
  const assignmentId = 'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb';
  const availId = 'cccccccc-cccc-4ccc-accc-cccccccccccc';

  const mockDriver: any = {
    id: driverId,
    userId: driverUserId,
    employeeCode: 'EMP-001',
    licenseNumber: 'DL-001',
    licenseExpiryDate: '2030-12-31',
    employmentStatus: 'ACTIVE',
    verificationStatus: 'VERIFIED',
  };

  const mockOtherDriver: any = {
    id: otherDriverId,
    userId: otherDriverUserId,
    employeeCode: 'EMP-002',
    licenseNumber: 'DL-002',
    licenseExpiryDate: '2030-12-31',
    employmentStatus: 'ACTIVE',
    verificationStatus: 'VERIFIED',
  };

  const mockAssignment: any = {
    id: assignmentId,
    driver_id: driverId,
    vehicle_id: vehicleId,
    trip_id: null,
    assignment_type: 'REGULAR_SHIFT',
    start_at: new Date('2026-11-01T08:00:00Z'),
    end_at: new Date('2026-11-01T16:00:00Z'),
    status: 'SCHEDULED',
    assigned_by: operatorUserId,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const mockAvailability: any = {
    id: availId,
    driver_id: driverId,
    day_of_week: 1,
    start_time: '08:00:00',
    end_time: '17:00:00',
    is_available: true,
    effective_date: '2026-11-01',
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
    query: jest.fn().mockImplementation((text: string, params: any[]) => {
      if (text.includes('FROM vehicles WHERE id = $1')) {
        return Promise.resolve({
          rows: [{ id: params[0], status: 'ACTIVE' }],
        });
      }
      return Promise.resolve({ rows: [] });
    }),
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

  const mockAssignmentsRepo = {
    createAssignment: jest.fn().mockResolvedValue(mockAssignment),
    findAssignmentById: jest.fn().mockImplementation((id: string) => {
      if (id === assignmentId) return Promise.resolve(mockAssignment);
      return Promise.resolve(null);
    }),
    findConflictingDriverAssignment: jest.fn().mockResolvedValue(null),
    findConflictingVehicleAssignment: jest.fn().mockResolvedValue(null),
    findAssignments: jest.fn().mockResolvedValue({
      assignments: [mockAssignment],
      total: 1,
    }),
    updateAssignmentStatus: jest.fn().mockImplementation((id: string, status: string) => {
      return Promise.resolve({ ...mockAssignment, id, status });
    }),
    createAvailability: jest.fn().mockResolvedValue(mockAvailability),
    findAvailabilityByDriver: jest.fn().mockResolvedValue([mockAvailability]),
    deleteAvailability: jest.fn().mockResolvedValue(mockAvailability),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useValue(mockDatabaseService)
      .overrideProvider(RedisService)
      .useValue(mockRedisService)
      .overrideProvider(DriversRepository)
      .useValue(mockDriversRepo)
      .overrideProvider(DriverAssignmentsRepository)
      .useValue(mockAssignmentsRepo)
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

    operatorToken = jwtService.sign({
      sub: operatorUserId,
      email: 'operator@movana.internal',
      roles: ['OPERATOR'],
      permissions: [],
    });

    driverToken = jwtService.sign({
      sub: driverUserId,
      email: 'driver@movana.internal',
      roles: ['DRIVER'],
      permissions: [],
    });

    otherDriverToken = jwtService.sign({
      sub: otherDriverUserId,
      email: 'otherdriver@movana.internal',
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

  describe('POST /api/v1/driver-assignments', () => {
    it('should reject unauthenticated request (401 Unauthorized)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/driver-assignments')
        .send({
          driverId,
          startAt: '2026-11-01T08:00:00.000Z',
        })
        .expect(401);
    });

    it('should reject non-operator/admin user (403 Forbidden)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/driver-assignments')
        .set('Authorization', `Bearer ${driverToken}`)
        .send({
          driverId,
          startAt: '2026-11-01T08:00:00.000Z',
        })
        .expect(403);
    });

    it('should reject passenger user attempting to schedule duty (403 Forbidden)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/driver-assignments')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({
          driverId,
          startAt: '2026-11-01T08:00:00.000Z',
        })
        .expect(403);
    });

    it('should allow admin user to schedule assignment (201 Created)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/driver-assignments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          driverId,
          vehicleId,
          startAt: '2026-11-01T08:00:00.000Z',
          endAt: '2026-11-01T16:00:00.000Z',
          assignmentType: 'REGULAR_SHIFT',
        })
        .expect(201);

      expect(res.body.id).toBe(assignmentId);
    });

    it('should reject assignment when endAt is earlier than startAt (400 Bad Request)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/driver-assignments')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          driverId,
          startAt: '2026-11-01T12:00:00.000Z',
          endAt: '2026-11-01T08:00:00.000Z',
        })
        .expect(400);
    });

    it('should reject assignment if driver has conflict (409 Conflict)', async () => {
      mockAssignmentsRepo.findConflictingDriverAssignment.mockResolvedValueOnce(mockAssignment);

      await request(app.getHttpServer())
        .post('/api/v1/driver-assignments')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          driverId,
          vehicleId,
          startAt: '2026-11-01T08:00:00.000Z',
          endAt: '2026-11-01T16:00:00.000Z',
        })
        .expect(409);
    });

    it('should successfully schedule assignment for operator (201 Created)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/driver-assignments')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          driverId,
          vehicleId,
          startAt: '2026-11-01T08:00:00.000Z',
          endAt: '2026-11-01T16:00:00.000Z',
          assignmentType: 'REGULAR_SHIFT',
        })
        .expect(201);

      expect(res.body.id).toBe(assignmentId);
      expect(res.body.status).toBe('SCHEDULED');
    });
  });

  describe('GET /api/v1/driver-assignments', () => {
    it('should return assignments list for operator (200 OK)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/driver-assignments')
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(200);

      expect(res.body.assignments).toHaveLength(1);
      expect(res.body.total).toBe(1);
    });

    it('should allow driver to fetch assignments scoped to their profile (200 OK)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/driver-assignments')
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(200);

      expect(res.body.assignments).toBeDefined();
    });
  });

  describe('GET /api/v1/driver-assignments/:id', () => {
    it('should return 404 for nonexistent assignment ID', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/driver-assignments/99999999-9999-4999-a999-999999999999')
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(404);
    });

    it('should reject another driver from viewing assignment (403 Forbidden)', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/driver-assignments/${assignmentId}`)
        .set('Authorization', `Bearer ${otherDriverToken}`)
        .expect(403);
    });

    it('should allow assigned driver to view their assignment (200 OK)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/driver-assignments/${assignmentId}`)
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(200);

      expect(res.body.id).toBe(assignmentId);
    });
  });

  describe('PATCH /api/v1/driver-assignments/:id/status', () => {
    it('should reject driver attempting to cancel assignment (403 Forbidden)', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/driver-assignments/${assignmentId}/status`)
        .set('Authorization', `Bearer ${driverToken}`)
        .send({ status: 'CANCELLED' })
        .expect(403);
    });

    it('should allow driver to transition SCHEDULED -> ACTIVE (200 OK)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/driver-assignments/${assignmentId}/status`)
        .set('Authorization', `Bearer ${driverToken}`)
        .send({ status: 'ACTIVE' })
        .expect(200);

      expect(res.body.status).toBe('ACTIVE');
    });

    it('should allow operator to transition ACTIVE -> CANCELLED (200 OK)', async () => {
      mockAssignmentsRepo.findAssignmentById.mockResolvedValueOnce({
        ...mockAssignment,
        status: 'ACTIVE',
      });

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/driver-assignments/${assignmentId}/status`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({ status: 'CANCELLED' })
        .expect(200);

      expect(res.body.status).toBe('CANCELLED');
    });
  });

  describe('Driver Availability Shifts', () => {
    it('should reject other driver from setting availability shift (403 Forbidden)', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/drivers/${driverId}/availability`)
        .set('Authorization', `Bearer ${otherDriverToken}`)
        .send({
          dayOfWeek: 1,
          startTime: '08:00',
          endTime: '17:00',
          isAvailable: true,
        })
        .expect(403);
    });

    it('should allow driver to create availability shift (201 Created)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/drivers/${driverId}/availability`)
        .set('Authorization', `Bearer ${driverToken}`)
        .send({
          dayOfWeek: 1,
          startTime: '08:00',
          endTime: '17:00',
          isAvailable: true,
        })
        .expect(201);

      expect(res.body.id).toBe(availId);
      expect(res.body.day_of_week).toBe(1);
    });

    it('should return availability shift roster (200 OK)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/drivers/${driverId}/availability`)
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe(availId);
    });

    it('should delete availability shift (204 No Content)', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/drivers/${driverId}/availability/${availId}`)
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(204);
    });
  });
});
