import { Test, TestingModule } from '@nestjs/testing';
import { SavedJourneysController } from './saved-journeys.controller';
import { SavedJourneysService } from '../services/saved-journeys.service';

describe('SavedJourneysController', () => {
  let controller: SavedJourneysController;
  let service: jest.Mocked<SavedJourneysService>;

  const mockUser: any = {
    id: '11111111-1111-4111-a111-111111111111',
    email: 'passenger@movana.internal',
    roles: ['PASSENGER'],
  };

  const locId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
  const routeId = 'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb';

  beforeEach(async () => {
    const mockService = {
      saveLocation: jest.fn(),
      getUserLocations: jest.fn(),
      deleteLocation: jest.fn(),
      saveRoute: jest.fn(),
      getUserRoutes: jest.fn(),
      deleteRoute: jest.fn(),
      getNextTripForSavedRoute: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SavedJourneysController],
      providers: [{ provide: SavedJourneysService, useValue: mockService }],
    }).compile();

    controller = module.get<SavedJourneysController>(SavedJourneysController);
    service = module.get(SavedJourneysService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('saveLocation', () => {
    it('should delegate to service.saveLocation', async () => {
      service.saveLocation.mockResolvedValueOnce({ id: locId } as any);

      const body = {
        addressType: 'HOME',
        streetAddress: '123 Station Road',
        city: 'Delhi',
        state: 'Delhi',
        postalCode: '110001',
      };

      const res = await controller.saveLocation(body, mockUser);
      expect(res).toEqual({ id: locId });
      expect(service.saveLocation).toHaveBeenCalledWith(
        mockUser,
        expect.objectContaining({ addressType: 'HOME' }),
      );
    });
  });

  describe('getUserLocations', () => {
    it('should delegate to service.getUserLocations', async () => {
      service.getUserLocations.mockResolvedValueOnce([]);

      const res = await controller.getUserLocations(mockUser);
      expect(res).toEqual([]);
      expect(service.getUserLocations).toHaveBeenCalledWith(mockUser.id);
    });
  });

  describe('deleteLocation', () => {
    it('should delegate to service.deleteLocation', async () => {
      service.deleteLocation.mockResolvedValueOnce({
        success: true,
        message: 'Deleted',
      });

      const res = await controller.deleteLocation(locId, mockUser);
      expect(res.success).toBe(true);
      expect(service.deleteLocation).toHaveBeenCalledWith(locId, mockUser);
    });
  });

  describe('saveRoute', () => {
    it('should delegate to service.saveRoute', async () => {
      service.saveRoute.mockResolvedValueOnce({ id: routeId } as any);

      const body = {
        name: 'Work Route',
        originStopId: locId,
        destinationStopId: routeId,
      };

      const res = await controller.saveRoute(body, mockUser);
      expect(res).toEqual({ id: routeId });
      expect(service.saveRoute).toHaveBeenCalledWith(
        mockUser,
        expect.objectContaining({ name: 'Work Route' }),
      );
    });
  });

  describe('getUserRoutes', () => {
    it('should delegate to service.getUserRoutes', async () => {
      service.getUserRoutes.mockResolvedValueOnce([]);

      const res = await controller.getUserRoutes(mockUser);
      expect(res).toEqual([]);
      expect(service.getUserRoutes).toHaveBeenCalledWith(mockUser.id);
    });
  });

  describe('deleteRoute', () => {
    it('should delegate to service.deleteRoute', async () => {
      service.deleteRoute.mockResolvedValueOnce({
        success: true,
        message: 'Deleted',
      });

      const res = await controller.deleteRoute(routeId, mockUser);
      expect(res.success).toBe(true);
      expect(service.deleteRoute).toHaveBeenCalledWith(routeId, mockUser);
    });
  });

  describe('getNextTrip', () => {
    it('should delegate to service.getNextTripForSavedRoute', async () => {
      service.getNextTripForSavedRoute.mockResolvedValueOnce({
        savedRoute: {} as any,
        hasActiveTrip: true,
        nextTrip: {},
      });

      const res = await controller.getNextTrip(routeId, mockUser);
      expect(res.hasActiveTrip).toBe(true);
      expect(service.getNextTripForSavedRoute).toHaveBeenCalledWith(routeId, mockUser);
    });
  });
});
