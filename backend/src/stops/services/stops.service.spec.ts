import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { StopsRepository } from '../repositories/stops.repository';
import { StopsService } from './stops.service';

describe('StopsService', () => {
  let service: StopsService;
  let repo: jest.Mocked<StopsRepository>;

  const stopId = '11111111-1111-4111-a111-111111111111';

  const mockStop: any = {
    id: stopId,
    stop_code: 'DEL-NDLS-01',
    name: 'New Delhi Railway Station Gate 2',
    description: 'Pahar Ganj entrance bus stop',
    address: 'Bhavbhuti Marg, Ratan Lal Market',
    city: 'New Delhi',
    state: 'Delhi',
    country: 'India',
    postal_code: '110006',
    latitude: 28.6429,
    longitude: 77.2195,
    geofence_radius_meters: 100,
    status: 'ACTIVE',
    created_at: new Date(),
    updated_at: new Date(),
  };

  beforeEach(async () => {
    const mockRepo = {
      createStop: jest.fn().mockResolvedValue(mockStop),
      findByCode: jest.fn().mockImplementation((code: string) => {
        if (code === mockStop.stop_code) return Promise.resolve(mockStop);
        return Promise.resolve(null);
      }),
      findById: jest.fn().mockImplementation((id: string) => {
        if (id === stopId) return Promise.resolve(mockStop);
        return Promise.resolve(null);
      }),
      findAll: jest.fn().mockResolvedValue({
        items: [mockStop],
        total: 1,
      }),
      findNearby: jest.fn().mockResolvedValue([
        {
          ...mockStop,
          distance_km: 1.25,
        },
      ]),
      updateStop: jest.fn().mockResolvedValue({
        ...mockStop,
        name: 'New Delhi Railway Station Gate 2 (Renovated)',
      }),
      updateStatus: jest.fn().mockResolvedValue({
        ...mockStop,
        status: 'TEMPORARILY_CLOSED',
      }),
      deleteStop: jest.fn().mockResolvedValue(mockStop),
      countActiveRoutesUsingStop: jest.fn().mockResolvedValue(0),
      countRouteStopsUsingStop: jest.fn().mockResolvedValue(0),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [StopsService, { provide: StopsRepository, useValue: mockRepo }],
    }).compile();

    service = module.get<StopsService>(StopsService);
    repo = module.get(StopsRepository);
  });

  describe('createStop', () => {
    it('creates a new transit stop', async () => {
      const result = await service.createStop({
        stopCode: 'DEL-NEW-01',
        name: 'Aerocity Metro Platform',
        address: 'Aerocity Hospitality District',
        city: 'New Delhi',
        state: 'Delhi',
        latitude: 28.5492,
        longitude: 77.1213,
      });

      expect(result).toBeDefined();
      expect(repo.createStop).toHaveBeenCalledWith(
        expect.objectContaining({
          stopCode: 'DEL-NEW-01',
          name: 'Aerocity Metro Platform',
        }),
      );
    });

    it('throws ConflictException if stopCode already exists', async () => {
      await expect(
        service.createStop({
          stopCode: mockStop.stop_code,
          name: 'Duplicate',
          address: 'Address',
          city: 'New Delhi',
          state: 'Delhi',
          latitude: 28.6429,
          longitude: 77.2195,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('getStops', () => {
    it('lists stops with filters and pagination', async () => {
      const result = await service.getStops({ limit: 10, offset: 0 });
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });

  describe('getNearbyStops', () => {
    it('returns stops within search radius with distance', async () => {
      const result = await service.getNearbyStops({
        latitude: 28.64,
        longitude: 77.22,
        radiusKm: 5,
        limit: 10,
      });

      expect(result).toHaveLength(1);
      expect(result[0].distance_km).toBe(1.25);
      expect(repo.findNearby).toHaveBeenCalledWith(28.64, 77.22, 5, 10);
    });
  });

  describe('getStopById', () => {
    it('returns stop if found', async () => {
      const result = await service.getStopById(stopId);
      expect(result.id).toBe(stopId);
    });

    it('throws NotFoundException if not found', async () => {
      await expect(service.getStopById('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateStop', () => {
    it('updates stop details', async () => {
      const result = await service.updateStop(stopId, {
        name: 'New Delhi Railway Station Gate 2 (Renovated)',
      });
      expect(result.name).toBe('New Delhi Railway Station Gate 2 (Renovated)');
    });
  });

  describe('updateStopStatus', () => {
    it('updates status when no active routes conflict', async () => {
      const result = await service.updateStopStatus(stopId, { status: 'TEMPORARILY_CLOSED' });
      expect(result.status).toBe('TEMPORARILY_CLOSED');
    });

    it('throws ConflictException if deactivating when active routes depend on this stop', async () => {
      repo.countActiveRoutesUsingStop.mockResolvedValueOnce(2);

      await expect(service.updateStopStatus(stopId, { status: 'INACTIVE' })).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('deleteStop', () => {
    it('deletes stop when unreferenced', async () => {
      const result = await service.deleteStop(stopId);
      expect(result.id).toBe(stopId);
      expect(repo.deleteStop).toHaveBeenCalledWith(stopId);
    });

    it('throws ConflictException when active routes depend on this stop', async () => {
      repo.countActiveRoutesUsingStop.mockResolvedValueOnce(1);
      await expect(service.deleteStop(stopId)).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException when route_stops intermediate alignments reference this stop', async () => {
      repo.countRouteStopsUsingStop.mockResolvedValueOnce(3);
      await expect(service.deleteStop(stopId)).rejects.toThrow(ConflictException);
    });
  });
});
