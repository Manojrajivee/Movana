import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { DatabaseService } from '../src/database/database.service';
import { RedisService } from '../src/redis/redis.service';
import { DriversRepository } from '../src/drivers/repositories/drivers.repository';

describe('Drivers Module (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let driverToken: string;
  let operatorToken: string;
  let passengerToken: string;
  let adminToken: string;

  const driverUserId = '11111111-1111-4111-a111-111111111111';
  const driverId = 'dddddddd-dddd-4ddd-addd-dddddddddddd';
  const operatorUserId = '22222222-2222-4222-a222-222222222222';
  const passengerUserId = '33333333-3333-4333-a333-333333333333';
  const adminUserId = '44444444-4444-4444-a444-444444444444';

  const mockDriver: any = {
    id: driverId,
    userId: driverUserId,
    employeeCode: 'EMP-BLR-001',
    licenseNumber: 'DL-KA-2020-001',
    licenseCategory: 'HEAVY_PASSENGER',
    licenseExpiryDate: '2030-12-31',
    dateOfJoining: '2024-01-01',
    employmentStatus: 'ACTIVE',
    verificationStatus: 'PENDING',
    ratingAverage: 5.0,
    totalTrips: 15,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    user: {
      id: driverUserId,
      email: 'driver@movana.test',
      firstName: 'Suresh',
      lastName: 'Kumar',
      phone: '+919876543211',
      status: 'ACTIVE',
    },
    emergencyContact: null,
  };

  const mockDriversRepo = {
    create: jest.fn(),
    findById: jest.fn(),
    findByUserId: jest.fn(),
    findByEmployeeCode: jest.fn(),
    findByLicenseNumber: jest.fn(),
    update: jest.fn(),
    updateStatus: jest.fn(),
    findAll: jest.fn(),
  };

  const mockDatabaseService = {
    checkHealth: jest.fn().mockResolvedValue({
      status: 'up',
      latencyMs: 5,
      database: 'movana',
      user: 'movana_app',
    }),
    closePool: jest.fn().mockResolvedValue(undefined),
  };

  const mockRedisService = {
    checkHealth: jest.fn().mockResolvedValue({
      status: 'up',
      latencyMs: 2,
      required: false,
    }),
    closeClient: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.APP_PORT = '3004';
    process.env.DATABASE_NAME = 'movana';
    process.env.DATABASE_USER = 'movana_app';
    process.env.DATABASE_PASSWORD = 'TestIntegrationSecretPassword123!';
    process.env.REDIS_REQUIRED_FOR_READY = 'false';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useValue(mockDatabaseService)
      .overrideProvider(RedisService)
      .useValue(mockRedisService)
      .overrideProvider(DriversRepository)
      .useValue(mockDriversRepo)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    jwtService = moduleFixture.get<JwtService>(JwtService);

    driverToken = await jwtService.signAsync({
      sub: driverUserId,
      email: 'driver@movana.test',
      roles: ['DRIVER'],
      permissions: [],
    });

    operatorToken = await jwtService.signAsync({
      sub: operatorUserId,
      email: 'operator@movana.test',
      roles: ['OPERATOR'],
      permissions: ['drivers.verify', 'drivers.assign'],
    });

    passengerToken = await jwtService.signAsync({
      sub: passengerUserId,
      email: 'passenger@movana.test',
      roles: ['PASSENGER'],
      permissions: [],
    });

    adminToken = await jwtService.signAsync({
      sub: adminUserId,
      email: 'admin@movana.test',
      roles: ['ADMIN'],
      permissions: ['*'],
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

  describe('POST /api/v1/drivers (Provision Driver)', () => {
    const newDriverPayload = {
      userId: '55555555-5555-4555-a555-555555555555',
      employeeCode: 'EMP-DEL-009',
      licenseNumber: 'DL-DL-2022-009',
      licenseCategory: 'HEAVY_PASSENGER',
      licenseExpiryDate: '2029-12-31',
    };

    it('should return 401 when no token is provided', async () => {
      await request(app.getHttpServer()).post('/api/v1/drivers').send(newDriverPayload).expect(401);
    });

    it('should return 403 when called by regular PASSENGER', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/drivers')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send(newDriverPayload)
        .expect(403);
    });

    it('should successfully provision driver when called by OPERATOR (201 Created)', async () => {
      mockDriversRepo.findByUserId.mockResolvedValue(null);
      mockDriversRepo.findByEmployeeCode.mockResolvedValue(null);
      mockDriversRepo.findByLicenseNumber.mockResolvedValue(null);
      mockDriversRepo.create.mockResolvedValue({
        ...mockDriver,
        ...newDriverPayload,
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/drivers')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send(newDriverPayload)
        .expect(201);

      expect(res.body.employeeCode).toBe('EMP-DEL-009');
    });

    it('should return 400 Bad Request when license expiry date is in the past', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/drivers')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({ ...newDriverPayload, licenseExpiryDate: '2020-01-01' })
        .expect(400);
    });

    it('should return 409 Conflict when employee code already exists', async () => {
      mockDriversRepo.findByUserId.mockResolvedValue(null);
      mockDriversRepo.findByEmployeeCode.mockResolvedValue(mockDriver);

      await request(app.getHttpServer())
        .post('/api/v1/drivers')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send(newDriverPayload)
        .expect(409);
    });
  });

  describe('GET /api/v1/drivers/me (Driver Profile)', () => {
    it('should return 200 OK for authenticated driver', async () => {
      mockDriversRepo.findByUserId.mockResolvedValue(mockDriver);

      const res = await request(app.getHttpServer())
        .get('/api/v1/drivers/me')
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(200);

      expect(res.body.id).toBe(driverId);
      expect(res.body.employeeCode).toBe('EMP-BLR-001');
    });

    it('should return 403 Forbidden if a passenger accesses drivers/me', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/drivers/me')
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(403);
    });
  });

  describe('GET /api/v1/drivers/:id (Ownership & Role checks)', () => {
    it('should allow driver to view their own profile by ID (200 OK)', async () => {
      mockDriversRepo.findById.mockResolvedValue(mockDriver);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/drivers/${driverId}`)
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(200);

      expect(res.body.id).toBe(driverId);
    });

    it('should allow OPERATOR to view driver profile by ID (200 OK)', async () => {
      mockDriversRepo.findById.mockResolvedValue(mockDriver);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/drivers/${driverId}`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(200);

      expect(res.body.id).toBe(driverId);
    });

    it('should return 403 Forbidden when a passenger tries to view driver profile by ID', async () => {
      mockDriversRepo.findById.mockResolvedValue(mockDriver);

      await request(app.getHttpServer())
        .get(`/api/v1/drivers/${driverId}`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(403);
    });

    it('should return 404 when driver does not exist', async () => {
      mockDriversRepo.findById.mockResolvedValue(null);

      await request(app.getHttpServer())
        .get('/api/v1/drivers/99999999-9999-4999-a999-999999999999')
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(404);
    });
  });

  describe('PATCH /api/v1/drivers/:id/status (Status Transitions)', () => {
    it('should return 403 Forbidden when driver attempts to change their own status', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/drivers/${driverId}/status`)
        .set('Authorization', `Bearer ${driverToken}`)
        .send({ status: 'ON_LEAVE' })
        .expect(403);
    });

    it('should allow OPERATOR to transition driver status (200 OK)', async () => {
      mockDriversRepo.findById.mockResolvedValue(mockDriver);
      mockDriversRepo.updateStatus.mockResolvedValue(true);

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/drivers/${driverId}/status`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({ status: 'ON_LEAVE', reason: 'Scheduled leave' })
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /api/v1/drivers (Paginated Listing)', () => {
    it('should return 403 Forbidden for a regular passenger', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/drivers')
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(403);
    });

    it('should return 200 OK with paginated list for OPERATOR', async () => {
      mockDriversRepo.findAll.mockResolvedValue({
        items: [mockDriver],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/drivers')
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(200);

      expect(res.body.items).toHaveLength(1);
      expect(res.body.total).toBe(1);
    });

    it('should return 200 OK with paginated list for ADMIN', async () => {
      mockDriversRepo.findAll.mockResolvedValue({
        items: [mockDriver],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/drivers')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.items).toHaveLength(1);
      expect(res.body.total).toBe(1);
    });
  });
});
