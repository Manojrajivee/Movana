import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as crypto from 'crypto';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { DatabaseService } from '../src/database/database.service';
import { LocationSharingRepository } from '../src/location-sharing/repositories/location-sharing.repository';
import { RedisService } from '../src/redis/redis.service';

describe('Location Sharing (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  let passengerToken: string;
  let unauthorizedPassengerToken: string;
  let adminToken: string;

  const passengerId = '11111111-1111-4111-a111-111111111111';
  const unauthorizedPassengerId = '22222222-2222-4222-a222-222222222222';
  const adminId = '33333333-3333-4333-a333-333333333333';

  const tripId = '44444444-4444-4444-a444-444444444444';
  const shareId = '55555555-5555-4555-a555-555555555555';
  const rawToken = 'c'.repeat(64);
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

  const mockLocation = {
    tripId,
    tripNumber: 'TRIP-303',
    routeCode: 'RT-BLUE',
    routeName: 'Blue Metro Feeder',
    originStop: 'South Terminal',
    destinationStop: 'North Terminal',
    currentLatitude: 13.0827,
    currentLongitude: 80.2707,
    tripStatus: 'IN_TRANSIT',
    delayMinutes: 3,
    lastTelemetryAt: new Date().toISOString(),
  };

  const mockSession = {
    id: shareId,
    tripId,
    userId: passengerId,
    tokenHash,
    recipientLabel: 'Trusted Contact',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    revoked: false,
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

  const mockLocationSharingRepo = {
    validateTripExists: jest
      .fn()
      .mockImplementation((id: string) => Promise.resolve(id === tripId)),
    validateUserTripAuthorization: jest
      .fn()
      .mockImplementation((userId: string, _tripId: string) => {
        if (userId === passengerId || userId === adminId) return Promise.resolve(true);
        return Promise.resolve(false);
      }),
    findTripLocation: jest.fn().mockImplementation((id: string) => {
      if (id === tripId) return Promise.resolve(mockLocation);
      return Promise.resolve(null);
    }),
  };

  const mockRedisService = {
    isAvailable: jest.fn().mockReturnValue(true),
    get: jest.fn().mockImplementation(async (key: string) => {
      if (key === `movana:share:token:${tokenHash}`) return JSON.stringify(mockSession);
      if (key === `movana:share:id:${shareId}`) return tokenHash;
      return null;
    }),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    sadd: jest.fn().mockResolvedValue(1),
    srem: jest.fn().mockResolvedValue(1),
    smembers: jest.fn().mockResolvedValue([shareId]),
    publish: jest.fn().mockResolvedValue(1),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useValue(mockDatabaseService)
      .overrideProvider(LocationSharingRepository)
      .useValue(mockLocationSharingRepo)
      .overrideProvider(RedisService)
      .useValue(mockRedisService)
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

    unauthorizedPassengerToken = jwtService.sign({
      sub: unauthorizedPassengerId,
      email: 'unauthorized@movana.internal',
      roles: ['PASSENGER'],
    });

    adminToken = jwtService.sign({
      sub: adminId,
      email: 'admin@movana.internal',
      roles: ['ADMIN'],
    });
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('POST /api/v1/location-sharing', () => {
    it('should reject unauthenticated request with 401 Unauthorized', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/location-sharing')
        .send({
          tripId,
          durationMinutes: 60,
        })
        .expect(401);
    });

    it('should reject invalid payload with 400 Bad Request', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/location-sharing')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({
          tripId: 'invalid-not-uuid',
          durationMinutes: 2, // below minimum 5
        })
        .expect(400);
    });

    it('should reject unauthorized user attempting to share trip with 403 Forbidden', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/location-sharing')
        .set('Authorization', `Bearer ${unauthorizedPassengerToken}`)
        .send({
          tripId,
          durationMinutes: 60,
        })
        .expect(403);
    });

    it('should return 404 if tripId does not exist', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/location-sharing')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({
          tripId: '00000000-0000-4000-a000-000000000000',
          durationMinutes: 60,
        })
        .expect(404);
    });

    it('should allow authorized PASSENGER to create a location share with 201 Created', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/location-sharing')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({
          tripId,
          durationMinutes: 45,
          recipientLabel: 'Sister',
        })
        .expect(201);

      expect(response.body.id).toBeDefined();
      expect(response.body.tripId).toBe(tripId);
      expect(response.body.token).toBeDefined();
      expect(response.body.token).toHaveLength(64);
      expect(response.body.shareUrl).toBe(`/api/v1/location-sharing/public/${response.body.token}`);
      expect(response.body.expiresAt).toBeDefined();
    });

    it('should reject with 429 Too Many Requests when rate limit is exceeded', async () => {
      mockRedisService.get.mockResolvedValueOnce('10'); // trigger rate limit

      await request(app.getHttpServer())
        .post('/api/v1/location-sharing')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({
          tripId,
          durationMinutes: 60,
        })
        .expect(429);
    });
  });

  describe('GET /api/v1/location-sharing/public/:token', () => {
    it('should allow public access WITHOUT authentication token and return live location', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/location-sharing/public/${rawToken}`)
        .expect(200);

      expect(response.body.tripId).toBe(tripId);
      expect(response.body.tripNumber).toBe('TRIP-303');
      expect(response.body.currentLatitude).toBe(13.0827);
      expect(response.body.currentLongitude).toBe(80.2707);
      expect(response.body.tripStatus).toBe('IN_TRANSIT');
      expect(response.body.expiresAt).toBeDefined();

      // Verify no sensitive PII returned
      expect(response.body.userId).toBeUndefined();
      expect(response.body.driverPhone).toBeUndefined();
      expect(response.body.token).toBeUndefined();

      // Verify anti-caching security headers
      expect(response.headers['cache-control']).toContain('no-store');
      expect(response.headers['pragma']).toBe('no-cache');
    });

    it('should reject malformed token format with 400 Bad Request', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/location-sharing/public/short-invalid')
        .expect(400);
    });

    it('should return 404 if token does not exist in Redis', async () => {
      const nonExistentToken = 'd'.repeat(64);
      await request(app.getHttpServer())
        .get(`/api/v1/location-sharing/public/${nonExistentToken}`)
        .expect(404);
    });

    it('should return 404 if token has expired', async () => {
      const expiredRawToken = 'e'.repeat(64);
      const expiredHash = crypto.createHash('sha256').update(expiredRawToken).digest('hex');

      mockRedisService.get.mockImplementationOnce(async (key: string) => {
        if (key === `movana:share:token:${expiredHash}`) {
          return JSON.stringify({
            ...mockSession,
            tokenHash: expiredHash,
            expiresAt: new Date(Date.now() - 1000).toISOString(),
          });
        }
        return null;
      });

      await request(app.getHttpServer())
        .get(`/api/v1/location-sharing/public/${expiredRawToken}`)
        .expect(404);
    });

    it('should return 404 if token has been revoked', async () => {
      const revokedRawToken = 'f'.repeat(64);
      const revokedHash = crypto.createHash('sha256').update(revokedRawToken).digest('hex');

      mockRedisService.get.mockImplementationOnce(async (key: string) => {
        if (key === `movana:share:token:${revokedHash}`) {
          return JSON.stringify({
            ...mockSession,
            tokenHash: revokedHash,
            revoked: true,
          });
        }
        return null;
      });

      await request(app.getHttpServer())
        .get(`/api/v1/location-sharing/public/${revokedRawToken}`)
        .expect(404);
    });

    it('should return 503 Service Unavailable if Redis is down (Fail-Closed)', async () => {
      mockRedisService.isAvailable.mockReturnValueOnce(false);

      await request(app.getHttpServer())
        .get(`/api/v1/location-sharing/public/${rawToken}`)
        .expect(503);
    });
  });

  describe('GET /api/v1/location-sharing/active', () => {
    it('should reject unauthenticated request with 401', async () => {
      await request(app.getHttpServer()).get('/api/v1/location-sharing/active').expect(401);
    });

    it('should list active shares for authenticated user without exposing raw tokens', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/location-sharing/active')
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].id).toBe(shareId);
      expect(response.body[0].token).toBeUndefined(); // raw token redacted
    });
  });

  describe('DELETE /api/v1/location-sharing/:id', () => {
    it('should reject unauthenticated revocation with 401', async () => {
      await request(app.getHttpServer()).delete(`/api/v1/location-sharing/${shareId}`).expect(401);
    });

    it('should reject non-owner user attempting to revoke with 403 Forbidden', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/location-sharing/${shareId}`)
        .set('Authorization', `Bearer ${unauthorizedPassengerToken}`)
        .expect(403);
    });

    it('should allow session creator to revoke share with 200 OK', async () => {
      const response = await request(app.getHttpServer())
        .delete(`/api/v1/location-sharing/${shareId}`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('revoked');
    });

    it('should allow ADMIN to revoke share session with 200 OK', async () => {
      const response = await request(app.getHttpServer())
        .delete(`/api/v1/location-sharing/${shareId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should return 404 for non-existent or already expired share session', async () => {
      mockRedisService.get.mockResolvedValueOnce(null);

      await request(app.getHttpServer())
        .delete('/api/v1/location-sharing/00000000-0000-4000-a000-000000000000')
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(404);
    });
  });
});
