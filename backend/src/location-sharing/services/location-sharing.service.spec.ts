import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as crypto from 'crypto';
import { RedisService } from '../../redis/redis.service';
import { LocationSharingRepository } from '../repositories/location-sharing.repository';
import { LocationSharingService } from './location-sharing.service';

describe('LocationSharingService', () => {
  let service: LocationSharingService;
  let repository: jest.Mocked<LocationSharingRepository>;
  let redisService: jest.Mocked<RedisService>;

  const userId = '11111111-1111-4111-a111-111111111111';
  const otherUserId = '22222222-2222-4222-a222-222222222222';
  const tripId = '33333333-3333-4333-a333-333333333333';
  const rawToken = 'a'.repeat(64);
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const shareId = '44444444-4444-4444-a444-444444444444';

  const mockUser = {
    id: userId,
    email: 'passenger@example.com',
    roles: ['PASSENGER'],
  };

  const mockAdminUser = {
    id: '99999999-9999-4999-a999-999999999999',
    email: 'admin@example.com',
    roles: ['ADMIN'],
  };

  const mockLocation = {
    tripId,
    tripNumber: 'TRIP-101',
    routeCode: 'RT-1',
    routeName: 'City Express',
    originStop: 'Central Station',
    destinationStop: 'Airport Terminal',
    currentLatitude: 13.0827,
    currentLongitude: 80.2707,
    tripStatus: 'IN_TRANSIT',
    delayMinutes: 2,
    lastTelemetryAt: new Date().toISOString(),
  };

  beforeEach(async () => {
    const mockRepo = {
      validateTripExists: jest.fn().mockResolvedValue(true),
      validateUserTripAuthorization: jest.fn().mockResolvedValue(true),
      findTripLocation: jest.fn().mockResolvedValue(mockLocation),
    };

    const mockRedis = {
      isAvailable: jest.fn().mockReturnValue(true),
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
      sadd: jest.fn().mockResolvedValue(undefined),
      srem: jest.fn().mockResolvedValue(undefined),
      smembers: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LocationSharingService,
        { provide: LocationSharingRepository, useValue: mockRepo },
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<LocationSharingService>(LocationSharingService);
    repository = module.get(LocationSharingRepository);
    redisService = module.get(RedisService);
  });

  describe('createShare', () => {
    it('should create a valid location share session and return raw token once', async () => {
      const res = await service.createShare(
        {
          tripId,
          durationMinutes: 60,
          recipientLabel: 'Mom',
        },
        mockUser,
      );

      expect(res).toBeDefined();
      expect(res.id).toBeDefined();
      expect(res.tripId).toBe(tripId);
      expect(res.token).toHaveLength(64);
      expect(res.shareUrl).toBe(`/api/v1/location-sharing/public/${res.token}`);
      expect(new Date(res.expiresAt).getTime()).toBeGreaterThan(Date.now());

      // 1 for rate limit counter, 1 for token hash session, 1 for id-to-hash mapping
      expect(redisService.set).toHaveBeenCalledTimes(3);
      expect(redisService.sadd).toHaveBeenCalledTimes(1);
    });

    it('should reject share creation when Redis is unavailable (Fail-Closed)', async () => {
      redisService.isAvailable.mockReturnValue(false);

      await expect(service.createShare({ tripId, durationMinutes: 30 }, mockUser)).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('should reject share creation when trip does not exist', async () => {
      repository.validateTripExists.mockResolvedValueOnce(false);

      await expect(service.createShare({ tripId, durationMinutes: 30 }, mockUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should reject share creation when user is not authorized for the trip', async () => {
      repository.validateUserTripAuthorization.mockResolvedValueOnce(false);

      await expect(service.createShare({ tripId, durationMinutes: 30 }, mockUser)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should enforce rate limits on share creation', async () => {
      redisService.get.mockResolvedValueOnce('10'); // limit reached

      await expect(service.createShare({ tripId, durationMinutes: 30 }, mockUser)).rejects.toThrow(
        HttpException,
      );
    });

    it('should assign explicit expiration and TTL correctly', async () => {
      const durationMinutes = 120;
      const res = await service.createShare({ tripId, durationMinutes }, mockUser);

      const expectedTtl = durationMinutes * 60;
      expect(redisService.set).toHaveBeenCalledWith(
        expect.stringContaining('movana:share:token:'),
        expect.any(String),
        expectedTtl,
      );
      expect(res.expiresAt).toBeDefined();
    });
  });

  describe('getPublicLocation', () => {
    const activeSession = {
      id: shareId,
      tripId,
      userId,
      tokenHash,
      recipientLabel: 'Family',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      revoked: false,
    };

    it('should return redacted live location for valid, active token', async () => {
      redisService.get.mockImplementation(async (key: string) => {
        if (key === `movana:share:token:${tokenHash}`) {
          return JSON.stringify(activeSession);
        }
        return null;
      });

      const res = await service.getPublicLocation(rawToken);

      expect(res).toBeDefined();
      expect(res.tripId).toBe(tripId);
      expect(res.tripNumber).toBe('TRIP-101');
      expect(res.currentLatitude).toBe(13.0827);
      expect(res.currentLongitude).toBe(80.2707);
      expect(res.expiresAt).toBe(activeSession.expiresAt);

      // Verify strict PII redaction: no passenger ID, phone number, driver phone, or credentials
      expect((res as any).userId).toBeUndefined();
      expect((res as any).driverPhone).toBeUndefined();
      expect((res as any).passengerPhone).toBeUndefined();
      expect((res as any).token).toBeUndefined();
    });

    it('should reject invalid token format with 400 Bad Request', async () => {
      await expect(service.getPublicLocation('invalid-short-token')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should fail closed with 503 if Redis is unavailable during public access', async () => {
      redisService.isAvailable.mockReturnValue(false);

      await expect(service.getPublicLocation(rawToken)).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('should reject with 404 if token does not exist in Redis', async () => {
      redisService.get.mockResolvedValue(null);

      await expect(service.getPublicLocation(rawToken)).rejects.toThrow(NotFoundException);
    });

    it('should reject with 404 if token is expired', async () => {
      const expiredSession = {
        ...activeSession,
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      };
      redisService.get.mockImplementation(async (key: string) => {
        if (key === `movana:share:token:${tokenHash}`) {
          return JSON.stringify(expiredSession);
        }
        return null;
      });

      await expect(service.getPublicLocation(rawToken)).rejects.toThrow(NotFoundException);
    });

    it('should reject with 404 if token is marked revoked', async () => {
      const revokedSession = {
        ...activeSession,
        revoked: true,
      };
      redisService.get.mockImplementation(async (key: string) => {
        if (key === `movana:share:token:${tokenHash}`) {
          return JSON.stringify(revokedSession);
        }
        return null;
      });

      await expect(service.getPublicLocation(rawToken)).rejects.toThrow(NotFoundException);
    });

    it('should enforce rate limits on public token access', async () => {
      redisService.get.mockImplementation(async (key: string) => {
        if (key.includes('ratelimit:public')) {
          return '60'; // max reached
        }
        return null;
      });

      await expect(service.getPublicLocation(rawToken)).rejects.toThrow(HttpException);
    });

    it('should reject with 404 if trip location is not found in database', async () => {
      redisService.get.mockImplementation(async (key: string) => {
        if (key === `movana:share:token:${tokenHash}`) {
          return JSON.stringify(activeSession);
        }
        return null;
      });
      repository.findTripLocation.mockResolvedValueOnce(null);

      await expect(service.getPublicLocation(rawToken)).rejects.toThrow(NotFoundException);
    });
  });

  describe('revokeShare', () => {
    const activeSession = {
      id: shareId,
      tripId,
      userId,
      tokenHash,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      revoked: false,
    };

    it('should allow session creator to revoke their share', async () => {
      redisService.get.mockImplementation(async (key: string) => {
        if (key === `movana:share:id:${shareId}`) return tokenHash;
        if (key === `movana:share:token:${tokenHash}`) return JSON.stringify(activeSession);
        return null;
      });

      const res = await service.revokeShare(shareId, mockUser);
      expect(res.success).toBe(true);
      expect(redisService.del).toHaveBeenCalledWith(`movana:share:token:${tokenHash}`);
      expect(redisService.del).toHaveBeenCalledWith(`movana:share:id:${shareId}`);
      expect(redisService.srem).toHaveBeenCalledWith(`movana:share:user:${userId}`, shareId);
    });

    it('should allow ADMIN to revoke any user share session', async () => {
      redisService.get.mockImplementation(async (key: string) => {
        if (key === `movana:share:id:${shareId}`) return tokenHash;
        if (key === `movana:share:token:${tokenHash}`) return JSON.stringify(activeSession);
        return null;
      });

      const res = await service.revokeShare(shareId, mockAdminUser);
      expect(res.success).toBe(true);
    });

    it('should reject non-owner user attempting to revoke share with 403 Forbidden', async () => {
      redisService.get.mockImplementation(async (key: string) => {
        if (key === `movana:share:id:${shareId}`) return tokenHash;
        if (key === `movana:share:token:${tokenHash}`) return JSON.stringify(activeSession);
        return null;
      });

      const nonOwner = { id: otherUserId, email: 'other@example.com', roles: ['PASSENGER'] };
      await expect(service.revokeShare(shareId, nonOwner)).rejects.toThrow(ForbiddenException);
    });

    it('should return 404 if share ID is not found or expired', async () => {
      redisService.get.mockResolvedValue(null);

      await expect(service.revokeShare(shareId, mockUser)).rejects.toThrow(NotFoundException);
    });

    it('should reject invalid UUID format for shareId with 400 Bad Request', async () => {
      await expect(service.revokeShare('invalid-uuid', mockUser)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('getActiveShares', () => {
    it('should return active shares for current user and prune expired entries', async () => {
      const activeSession = {
        id: shareId,
        tripId,
        userId,
        tokenHash,
        recipientLabel: 'Dad',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        revoked: false,
      };

      redisService.smembers.mockResolvedValueOnce([shareId, 'expired-share-id']);
      redisService.get.mockImplementation(async (key: string) => {
        if (key === `movana:share:id:${shareId}`) return tokenHash;
        if (key === `movana:share:token:${tokenHash}`) return JSON.stringify(activeSession);
        return null; // for expired-share-id
      });

      const res = await service.getActiveShares(mockUser);
      expect(res).toHaveLength(1);
      expect(res[0].id).toBe(shareId);
      expect(res[0].recipientLabel).toBe('Dad');
      expect(res[0].status).toBe('ACTIVE');

      // Verify expired share was pruned
      expect(redisService.srem).toHaveBeenCalledWith(
        `movana:share:user:${userId}`,
        'expired-share-id',
      );
    });
  });
});
