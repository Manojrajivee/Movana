import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { DatabaseService } from '../src/database/database.service';
import { RedisService } from '../src/redis/redis.service';
import { UsersRepository } from '../src/users/repositories/users.repository';

describe('Users & RBAC (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let passengerToken: string;
  let otherPassengerToken: string;
  let adminToken: string;

  const passengerId = '11111111-1111-4111-a111-111111111111';
  const otherPassengerId = '22222222-2222-4222-a222-222222222222';
  const adminId = '33333333-3333-4333-a333-333333333333';

  const mockPassengerProfile: any = {
    id: passengerId,
    email: 'passenger@example.com',
    phone: '+919876543210',
    firstName: 'Aarav',
    lastName: 'Sharma',
    dateOfBirth: '1998-04-12',
    gender: 'MALE',
    profileImageUrl: null,
    status: 'ACTIVE',
    emailVerified: true,
    phoneVerified: true,
    lastLoginAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    roles: ['PASSENGER'],
    passengerProfile: {
      preferredLanguage: 'en',
      preferredCurrency: 'INR',
      accessibilityRequirements: null,
      specialRequirements: null,
    },
    preferences: {
      smsEnabled: true,
      emailEnabled: true,
      pushEnabled: true,
      marketingEnabled: false,
      tripUpdatesEnabled: true,
    },
  };

  const mockOtherProfile: any = {
    ...mockPassengerProfile,
    id: otherPassengerId,
    email: 'other@example.com',
  };

  const mockUsersRepo = {
    findById: jest.fn(),
    updateProfile: jest.fn(),
    updateStatus: jest.fn(),
    softDelete: jest.fn(),
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
    process.env.APP_PORT = '3003';
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
      .overrideProvider(UsersRepository)
      .useValue(mockUsersRepo)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    jwtService = moduleFixture.get<JwtService>(JwtService);

    passengerToken = await jwtService.signAsync({
      sub: passengerId,
      email: 'passenger@example.com',
      roles: ['PASSENGER'],
      permissions: ['booking:create'],
    });

    otherPassengerToken = await jwtService.signAsync({
      sub: otherPassengerId,
      email: 'other@example.com',
      roles: ['PASSENGER'],
      permissions: ['booking:create'],
    });

    adminToken = await jwtService.signAsync({
      sub: adminId,
      email: 'admin@movana.com',
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

  describe('GET /api/v1/users/me', () => {
    it('should return 401 Unauthorized when no Authorization header is provided', async () => {
      await request(app.getHttpServer()).get('/api/v1/users/me').expect(401);
    });

    it('should return 401 Unauthorized when an invalid token is provided', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });

    it('should return 200 OK with authenticated user profile', async () => {
      mockUsersRepo.findById.mockResolvedValue(mockPassengerProfile);

      const res = await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(200);

      expect(res.body.id).toBe(passengerId);
      expect(res.body.email).toBe('passenger@example.com');
      expect(res.body.roles).toContain('PASSENGER');
    });
  });

  describe('PATCH /api/v1/users/me', () => {
    it('should update profile and return 200 OK', async () => {
      mockUsersRepo.findById.mockResolvedValue(mockPassengerProfile);
      mockUsersRepo.updateProfile.mockResolvedValue({
        ...mockPassengerProfile,
        firstName: 'Aarav-Updated',
      });

      const res = await request(app.getHttpServer())
        .patch('/api/v1/users/me')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({ firstName: 'Aarav-Updated' })
        .expect(200);

      expect(res.body.firstName).toBe('Aarav-Updated');
    });

    it('should reject invalid profile updates with 400 Bad Request', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/users/me')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({ preferredCurrency: 'TOOLONG' })
        .expect(400);
    });
  });

  describe('GET /api/v1/users (Administrative Listing)', () => {
    it('should return 403 Forbidden for a regular passenger', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(403);
    });

    it('should return 200 OK for an administrator', async () => {
      mockUsersRepo.findAll.mockResolvedValue({
        items: [mockPassengerProfile],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.items).toHaveLength(1);
      expect(res.body.total).toBe(1);
    });
  });

  describe('GET /api/v1/users/:id (Ownership & Authorization)', () => {
    it('should allow user to view their own profile by ID (200 OK)', async () => {
      mockUsersRepo.findById.mockResolvedValue(mockPassengerProfile);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/users/${passengerId}`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(200);

      expect(res.body.id).toBe(passengerId);
    });

    it('should return 403 Forbidden when a passenger tries to view another user profile', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/users/${otherPassengerId}`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(403);
    });

    it('should allow other passenger to view their own profile by ID (200 OK)', async () => {
      mockUsersRepo.findById.mockResolvedValue(mockOtherProfile);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/users/${otherPassengerId}`)
        .set('Authorization', `Bearer ${otherPassengerToken}`)
        .expect(200);

      expect(res.body.id).toBe(otherPassengerId);
    });

    it('should allow an administrator to view any user profile by ID (200 OK)', async () => {
      mockUsersRepo.findById.mockResolvedValue(mockOtherProfile);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/users/${otherPassengerId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.id).toBe(otherPassengerId);
    });
  });

  describe('PATCH /api/v1/users/:id/status', () => {
    it('should return 403 Forbidden when a passenger attempts to change account status', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/users/${otherPassengerId}/status`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({ status: 'SUSPENDED' })
        .expect(403);
    });

    it('should return 200 OK when an administrator changes account status', async () => {
      mockUsersRepo.findById.mockResolvedValue(mockOtherProfile);
      mockUsersRepo.updateStatus.mockResolvedValue(true);

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/users/${otherPassengerId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'SUSPENDED' })
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });

  describe('DELETE /api/v1/users/:id', () => {
    it('should allow a passenger to deactivate their own account', async () => {
      mockUsersRepo.findById.mockResolvedValue(mockPassengerProfile);
      mockUsersRepo.softDelete.mockResolvedValue(true);

      const res = await request(app.getHttpServer())
        .delete(`/api/v1/users/${passengerId}`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('should return 403 Forbidden when a passenger attempts to deactivate another account', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/users/${otherPassengerId}`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(403);
    });

    it('should allow an administrator to deactivate any account', async () => {
      mockUsersRepo.findById.mockResolvedValue(mockOtherProfile);
      mockUsersRepo.softDelete.mockResolvedValue(true);

      const res = await request(app.getHttpServer())
        .delete(`/api/v1/users/${otherPassengerId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });
});
