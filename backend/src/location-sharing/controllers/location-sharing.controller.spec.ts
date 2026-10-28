import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Response } from 'express';
import { LocationSharingService } from '../services/location-sharing.service';
import { LocationSharingController } from './location-sharing.controller';

describe('LocationSharingController', () => {
  let controller: LocationSharingController;
  let service: jest.Mocked<LocationSharingService>;

  const userId = '11111111-1111-4111-a111-111111111111';
  const tripId = '22222222-2222-4222-a222-222222222222';
  const rawToken = 'b'.repeat(64);
  const shareId = '33333333-3333-4333-a333-333333333333';

  const mockUser = {
    id: userId,
    email: 'user@example.com',
    roles: ['PASSENGER'],
  };

  const mockShareResponse = {
    id: shareId,
    tripId,
    token: rawToken,
    shareUrl: `/api/v1/location-sharing/public/${rawToken}`,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
  };

  const mockPublicLocation = {
    tripId,
    tripNumber: 'TRIP-202',
    routeCode: 'RT-2',
    routeName: 'Suburban Line',
    originStop: 'Station A',
    destinationStop: 'Station B',
    currentLatitude: 12.9716,
    currentLongitude: 77.5946,
    tripStatus: 'IN_TRANSIT',
    delayMinutes: 0,
    lastTelemetryAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
  };

  beforeEach(async () => {
    const mockService = {
      createShare: jest.fn().mockResolvedValue(mockShareResponse),
      getActiveShares: jest.fn().mockResolvedValue([
        {
          id: shareId,
          tripId,
          createdAt: mockShareResponse.createdAt,
          expiresAt: mockShareResponse.expiresAt,
          status: 'ACTIVE',
        },
      ]),
      revokeShare: jest.fn().mockResolvedValue({
        success: true,
        message: 'Location sharing session revoked successfully',
      }),
      getPublicLocation: jest.fn().mockResolvedValue(mockPublicLocation),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [LocationSharingController],
      providers: [{ provide: LocationSharingService, useValue: mockService }],
    }).compile();

    controller = module.get<LocationSharingController>(LocationSharingController);
    service = module.get(LocationSharingService);
  });

  describe('createShare', () => {
    it('should validate DTO and call service.createShare', async () => {
      const dto = {
        tripId,
        durationMinutes: 60,
        recipientLabel: 'Friend',
      };

      const result = await controller.createShare(dto, mockUser);

      expect(result).toEqual(mockShareResponse);
      expect(service.createShare).toHaveBeenCalledWith(
        expect.objectContaining({ tripId, durationMinutes: 60 }),
        mockUser,
      );
    });

    it('should throw Zod error if tripId is invalid UUID', async () => {
      const invalidDto = {
        tripId: 'not-a-uuid',
      };

      await expect(controller.createShare(invalidDto, mockUser)).rejects.toThrow();
    });

    it('should throw Zod error if durationMinutes is below 5', async () => {
      const invalidDto = {
        tripId,
        durationMinutes: 2,
      };

      await expect(controller.createShare(invalidDto, mockUser)).rejects.toThrow();
    });
  });

  describe('getActiveShares', () => {
    it('should return active shares for current user', async () => {
      const result = await controller.getActiveShares(mockUser);

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(shareId);
      expect(service.getActiveShares).toHaveBeenCalledWith(mockUser);
    });
  });

  describe('revokeShare', () => {
    it('should call service.revokeShare with shareId and user', async () => {
      const result = await controller.revokeShare(shareId, mockUser);

      expect(result.success).toBe(true);
      expect(service.revokeShare).toHaveBeenCalledWith(shareId, mockUser);
    });
  });

  describe('getPublicLocation', () => {
    it('should return live location and set security headers (no-store)', async () => {
      const mockRes = {
        setHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      } as unknown as Response;

      await controller.getPublicLocation(rawToken, mockRes);

      expect(service.getPublicLocation).toHaveBeenCalledWith(rawToken);
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Cache-Control',
        'no-store, no-cache, must-revalidate, proxy-revalidate',
      );
      expect(mockRes.setHeader).toHaveBeenCalledWith('Pragma', 'no-cache');
      expect(mockRes.setHeader).toHaveBeenCalledWith('Expires', '0');
      expect(mockRes.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(mockRes.json).toHaveBeenCalledWith(mockPublicLocation);
    });
  });
});
