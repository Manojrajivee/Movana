import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { DatabaseService } from '../src/database/database.service';
import { RedisService } from '../src/redis/redis.service';
import { AuthRepository } from '../src/auth/repositories/auth.repository';
import { PasswordService } from '../src/auth/services/password.service';

describe('Authentication (e2e)', () => {
  let app: INestApplication;
  let passwordService: PasswordService;

  const mockUser: any = {
    id: '11111111-1111-4111-a111-111111111111',
    email: 'testpassenger@example.com',
    phone: '+919876543210',
    password_hash: '',
    first_name: 'Aarav',
    last_name: 'Sharma',
    status: 'ACTIVE',
    email_verified: false,
    phone_verified: false,
    last_login_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    roles: ['PASSENGER'],
  };

  const mockAuthRepo = {
    findByEmail: jest.fn(),
    createUserWithDefaults: jest.fn(),
    getUserPermissions: jest.fn().mockResolvedValue(['booking:create']),
    recordLoginAttempt: jest.fn().mockResolvedValue(undefined),
    updateLastLogin: jest.fn().mockResolvedValue(undefined),
    createSession: jest.fn().mockResolvedValue({ id: 'sess-1' }),
    findActiveSession: jest.fn(),
    revokeSession: jest.fn().mockResolvedValue(true),
    findByIdWithRoles: jest.fn(),
    createPasswordResetToken: jest.fn().mockResolvedValue(undefined),
    findPasswordResetToken: jest.fn(),
    consumePasswordReset: jest.fn().mockResolvedValue(undefined),
    revokeAllUserSessions: jest.fn().mockResolvedValue(undefined),
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
    process.env.APP_PORT = '3002';
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
      .overrideProvider(AuthRepository)
      .useValue(mockAuthRepo)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    passwordService = moduleFixture.get<PasswordService>(PasswordService);
    mockUser.password_hash = await passwordService.hashPassword('ValidPassword!123');
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthRepo.getUserPermissions.mockResolvedValue(['booking:create']);
  });

  describe('POST /api/v1/auth/register', () => {
    it('should register a new passenger account with 201 Created', async () => {
      mockAuthRepo.findByEmail.mockResolvedValue(null);
      mockAuthRepo.createUserWithDefaults.mockResolvedValue(mockUser);

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: 'testpassenger@example.com',
          password: 'ValidPassword!123',
          firstName: 'Aarav',
          lastName: 'Sharma',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.user.email).toBe('testpassenger@example.com');
      expect(res.body.tokens.accessToken).toBeDefined();
      expect(res.body.tokens.refreshToken).toBeDefined();
    });

    it('should return 400 Bad Request on weak password', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: 'testpassenger@example.com',
          password: 'weak',
          firstName: 'Aarav',
          lastName: 'Sharma',
        })
        .expect(400);

      expect(res.body.statusCode).toBe(400);
    });

    it('should return 409 Conflict if email is already taken', async () => {
      mockAuthRepo.findByEmail.mockResolvedValue(mockUser);

      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: 'testpassenger@example.com',
          password: 'ValidPassword!123',
          firstName: 'Aarav',
          lastName: 'Sharma',
        })
        .expect(409);
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('should log in successfully with valid credentials (200 OK)', async () => {
      mockAuthRepo.findByEmail.mockResolvedValue(mockUser);

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'testpassenger@example.com',
          password: 'ValidPassword!123',
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.tokens.accessToken).toBeDefined();
      expect(res.body.tokens.refreshToken).toBeDefined();
    });

    it('should return 401 Unauthorized on invalid password', async () => {
      mockAuthRepo.findByEmail.mockResolvedValue(mockUser);

      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'testpassenger@example.com',
          password: 'WrongPassword!123',
        })
        .expect(401);
    });

    it('should return 403 Forbidden if user is suspended', async () => {
      mockAuthRepo.findByEmail.mockResolvedValue({
        ...mockUser,
        status: 'SUSPENDED',
      });

      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'testpassenger@example.com',
          password: 'ValidPassword!123',
        })
        .expect(403);
    });
  });

  describe('POST /api/v1/auth/refresh', () => {
    it('should rotate tokens with 200 OK', async () => {
      mockAuthRepo.findActiveSession.mockResolvedValue({
        id: 'sess-123',
        user_id: mockUser.id,
        refresh_token_hash: 'hashed',
        expires_at: new Date(Date.now() + 100000),
        is_revoked: false,
      });
      mockAuthRepo.findByIdWithRoles.mockResolvedValue(mockUser);

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'active-token-xyz' })
        .expect(200);

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
    });

    it('should return 401 on invalid refresh token', async () => {
      mockAuthRepo.findActiveSession.mockResolvedValue(null);

      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'invalid-token' })
        .expect(401);
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('should revoke session with 200 OK', async () => {
      mockAuthRepo.findActiveSession.mockResolvedValue({
        id: 'sess-123',
        user_id: mockUser.id,
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .send({ refreshToken: 'active-token' })
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });

  describe('Password Reset flow', () => {
    it('should accept forgot-password request with 200 OK', async () => {
      mockAuthRepo.findByEmail.mockResolvedValue(mockUser);

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'testpassenger@example.com' })
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('should reset password on valid reset token with 200 OK', async () => {
      mockAuthRepo.findPasswordResetToken.mockResolvedValue({
        id: 'token-id-1',
        user_id: mockUser.id,
        token_hash: 'hash',
        expires_at: new Date(Date.now() + 100000),
        used_at: null,
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password')
        .send({
          token: 'valid-reset-token-123',
          newPassword: 'NewStrongP@ssw0rd123',
        })
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });
});
