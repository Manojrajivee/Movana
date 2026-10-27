import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SavedJourneysRepository } from '../repositories/saved-journeys.repository';
import { SavedJourneysService } from './saved-journeys.service';

describe('SavedJourneysService', () => {
  let service: SavedJourneysService;
  let repo: jest.Mocked<SavedJourneysRepository>;

  const userId = '11111111-1111-4111-a111-111111111111';
  const otherUserId = '99999999-9999-4999-a999-999999999999';

  const mockUser: any = {
    id: userId,
    email: 'passenger@movana.internal',
    roles: ['PASSENGER'],
  };

  const originStopId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
  const destStopId = 'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb';

  beforeEach(async () => {
    const mockRepo = {
      saveUserAddress: jest.fn(),
      findUserAddresses: jest.fn(),
      findUserAddressById: jest.fn(),
      deleteUserAddress: jest.fn(),
      findStopById: jest.fn(),
      saveSavedRoute: jest.fn(),
      findSavedRouteById: jest.fn(),
      findSavedRoutesByUserId: jest.fn(),
      deleteSavedRoute: jest.fn(),
      findNextTripBetweenStops: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [SavedJourneysService, { provide: SavedJourneysRepository, useValue: mockRepo }],
    }).compile();

    service = module.get<SavedJourneysService>(SavedJourneysService);
    repo = module.get(SavedJourneysRepository);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('saveLocation', () => {
    it('should delegate to repo.saveUserAddress', async () => {
      repo.saveUserAddress.mockResolvedValueOnce({
        id: 'addr-1',
        user_id: userId,
        address_type: 'HOME',
        street_address: '123 MG Road',
        city: 'Delhi',
        state: 'Delhi',
        postal_code: '110001',
        country: 'India',
        latitude: 28.6,
        longitude: 77.2,
        is_default: true,
        created_at: new Date(),
        updated_at: new Date(),
      });

      const res = await service.saveLocation(mockUser, {
        addressType: 'HOME',
        streetAddress: '123 MG Road',
        city: 'Delhi',
        state: 'Delhi',
        postalCode: '110001',
        country: 'India',
        isDefault: true,
      });

      expect(res.address_type).toBe('HOME');
      expect(repo.saveUserAddress).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({ addressType: 'HOME' }),
      );
    });
  });

  describe('deleteLocation', () => {
    it('should throw NotFoundException if address not found', async () => {
      repo.findUserAddressById.mockResolvedValueOnce(null);

      await expect(service.deleteLocation('loc-1', mockUser)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if address belongs to another user', async () => {
      repo.findUserAddressById.mockResolvedValueOnce({
        id: 'loc-1',
        user_id: otherUserId,
      } as any);

      await expect(service.deleteLocation('loc-1', mockUser)).rejects.toThrow(ForbiddenException);
    });

    it('should delete address when owned by caller', async () => {
      repo.findUserAddressById.mockResolvedValueOnce({
        id: 'loc-1',
        user_id: userId,
      } as any);
      repo.deleteUserAddress.mockResolvedValueOnce(true);

      const res = await service.deleteLocation('loc-1', mockUser);
      expect(res.success).toBe(true);
      expect(repo.deleteUserAddress).toHaveBeenCalledWith('loc-1', userId);
    });
  });

  describe('saveRoute', () => {
    it('should throw NotFoundException if origin stop not found', async () => {
      repo.findStopById.mockResolvedValueOnce(null);

      await expect(
        service.saveRoute(mockUser, {
          name: 'Office Commute',
          originStopId,
          destinationStopId: destStopId,
          daysOfWeek: ['MON'],
          notifyDelayAlerts: true,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if origin and destination are the same', async () => {
      repo.findStopById
        .mockResolvedValueOnce({ id: originStopId, name: 'Stop A' })
        .mockResolvedValueOnce({ id: originStopId, name: 'Stop A' });

      await expect(
        service.saveRoute(mockUser, {
          name: 'Office Commute',
          originStopId,
          destinationStopId: originStopId,
          daysOfWeek: ['MON'],
          notifyDelayAlerts: true,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should save commute route and return entity', async () => {
      repo.findStopById
        .mockResolvedValueOnce({ id: originStopId, name: 'Kashmere Gate' })
        .mockResolvedValueOnce({ id: destStopId, name: 'Connaught Place' });

      const res = await service.saveRoute(mockUser, {
        name: 'Daily Office Commute',
        originStopId,
        destinationStopId: destStopId,
        preferredDepartureTime: '08:30',
        daysOfWeek: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
        notifyDelayAlerts: true,
      });

      expect(res.name).toBe('Daily Office Commute');
      expect(res.userId).toBe(userId);
      expect(res.originStopName).toBe('Kashmere Gate');
      expect(res.destinationStopName).toBe('Connaught Place');
      expect(repo.saveSavedRoute).toHaveBeenCalled();
    });
  });

  describe('deleteRoute', () => {
    it('should throw NotFoundException if route not found', async () => {
      repo.findSavedRouteById.mockResolvedValueOnce(null);

      await expect(service.deleteRoute('rt-1', mockUser)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if route belongs to other user', async () => {
      repo.findSavedRouteById.mockResolvedValueOnce({
        id: 'rt-1',
        userId: otherUserId,
      } as any);

      await expect(service.deleteRoute('rt-1', mockUser)).rejects.toThrow(ForbiddenException);
    });

    it('should delete route if owned by user', async () => {
      repo.findSavedRouteById.mockResolvedValueOnce({
        id: 'rt-1',
        userId,
      } as any);

      const res = await service.deleteRoute('rt-1', mockUser);
      expect(res.success).toBe(true);
      expect(repo.deleteSavedRoute).toHaveBeenCalledWith('rt-1', userId);
    });
  });

  describe('getNextTripForSavedRoute', () => {
    it('should return next upcoming trip details for saved route', async () => {
      repo.findSavedRouteById.mockResolvedValueOnce({
        id: 'rt-1',
        userId,
        name: 'Work Route',
        originStopId,
        destinationStopId: destStopId,
      } as any);

      repo.findNextTripBetweenStops.mockResolvedValueOnce({
        trip_id: 'tr-101',
        trip_number: 'TRIP-101',
        status: 'SCHEDULED',
        departure_time: new Date(),
      });

      const res = await service.getNextTripForSavedRoute('rt-1', mockUser);
      expect(res.hasActiveTrip).toBe(true);
      expect(res.nextTrip.trip_number).toBe('TRIP-101');
    });
  });
});
