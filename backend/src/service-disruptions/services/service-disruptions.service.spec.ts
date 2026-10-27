import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ServiceDisruptionsService } from './service-disruptions.service';
import {
  ServiceDisruption,
  ServiceDisruptionsRepository,
} from '../repositories/service-disruptions.repository';

describe('ServiceDisruptionsService', () => {
  let service: ServiceDisruptionsService;
  let repo: jest.Mocked<ServiceDisruptionsRepository>;

  const mockUser: any = {
    id: 'user-operator',
    email: 'operator@movana.internal',
    roles: ['OPERATOR'],
  };

  const mockRoute = {
    id: 'route-1',
    route_code: 'DEL-JPR',
    name: 'Delhi to Jaipur',
  };

  const mockTrip = {
    id: 'trip-1',
    trip_number: 'TRIP-101',
  };

  const getMockDisruption = (): ServiceDisruption => ({
    id: 'disrupt-1',
    title: 'NH-48 Highway Landslide Detour',
    description:
      'Heavy rains caused partial highway blockage; buses rerouted via Western Peripheral.',
    disruptionType: 'ROUTE_DETOUR',
    severity: 'WARNING',
    status: 'ACTIVE',
    routeId: 'route-1',
    routeCode: 'DEL-JPR',
    routeName: 'Delhi to Jaipur',
    tripId: null,
    tripNumber: null,
    affectedStops: ['stop-2'],
    startsAt: new Date(),
    endsAt: null,
    resolvedAt: null,
    resolutionNotes: null,
    createdBy: 'user-operator',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  beforeEach(async () => {
    const mockRepo: Partial<jest.Mocked<ServiceDisruptionsRepository>> = {
      findRouteById: jest.fn(),
      findTripById: jest.fn(),
      findStopById: jest.fn(),
      saveDisruption: jest.fn(),
      findDisruptionById: jest.fn(),
      findActiveDisruptions: jest.fn(),
      findAllDisruptions: jest.fn(),
      deleteDisruption: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ServiceDisruptionsService,
        {
          provide: ServiceDisruptionsRepository,
          useValue: mockRepo,
        },
      ],
    }).compile();

    service = module.get<ServiceDisruptionsService>(ServiceDisruptionsService);
    repo = module.get(ServiceDisruptionsRepository);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createDisruption', () => {
    it('should throw NotFoundException if routeId does not exist', async () => {
      repo.findRouteById.mockResolvedValue(null);

      await expect(
        service.createDisruption(
          {
            title: 'Test disruption',
            description: 'Road repair ongoing',
            disruptionType: 'ROAD_CLOSURE',
            routeId: 'route-999',
          },
          mockUser,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if tripId does not exist', async () => {
      repo.findTripById.mockResolvedValue(null);

      await expect(
        service.createDisruption(
          {
            title: 'Test disruption',
            description: 'Bus breakdown on highway',
            disruptionType: 'ACCIDENT_BLOCK',
            tripId: 'trip-999',
          },
          mockUser,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if affected stop does not exist', async () => {
      repo.findStopById.mockResolvedValue(null);

      await expect(
        service.createDisruption(
          {
            title: 'Stop closure',
            description: 'Station flooded',
            disruptionType: 'MAINTENANCE_WORK',
            affectedStops: ['stop-999'],
          },
          mockUser,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if endsAt is before startsAt', async () => {
      await expect(
        service.createDisruption(
          {
            title: 'Bad dates',
            description: 'Testing timestamps',
            disruptionType: 'SPECIAL_EVENT',
            startsAt: '2026-10-28T12:00:00Z',
            endsAt: '2026-10-28T10:00:00Z',
          },
          mockUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create disruption successfully and save to repository', async () => {
      repo.findRouteById.mockResolvedValue(mockRoute as any);
      repo.findStopById.mockResolvedValue({ id: 'stop-2' } as any);
      repo.saveDisruption.mockResolvedValue(undefined);

      const res = await service.createDisruption(
        {
          title: 'NH-48 Highway Landslide Detour',
          description:
            'Heavy rains caused partial highway blockage; buses rerouted via Western Peripheral.',
          disruptionType: 'ROUTE_DETOUR',
          severity: 'WARNING',
          routeId: 'route-1',
          affectedStops: ['stop-2'],
        },
        mockUser,
      );

      expect(res.id).toBeDefined();
      expect(res.routeCode).toBe('DEL-JPR');
      expect(res.status).toBe('ACTIVE');
      expect(repo.saveDisruption).toHaveBeenCalled();
    });

    it('should create disruption successfully with tripId', async () => {
      repo.findTripById.mockResolvedValue(mockTrip as any);
      repo.saveDisruption.mockResolvedValue(undefined);

      const res = await service.createDisruption(
        {
          title: 'Trip breakdown',
          description: 'Bus experienced engine trouble',
          disruptionType: 'MAINTENANCE_WORK',
          tripId: 'trip-1',
        },
        mockUser,
      );

      expect(res.tripNumber).toBe('TRIP-101');
    });
  });

  describe('getDisruptions and getActiveDisruptions', () => {
    it('should return active disruptions list', async () => {
      repo.findActiveDisruptions.mockResolvedValue([getMockDisruption()]);

      const res = await service.getActiveDisruptions();
      expect(res).toHaveLength(1);
      expect(res[0].id).toBe('disrupt-1');
    });

    it('should filter disruptions by severity and route', async () => {
      repo.findActiveDisruptions.mockResolvedValue([getMockDisruption()]);

      const res = await service.getDisruptions({
        status: 'ACTIVE',
        routeId: 'route-1',
        severity: 'WARNING',
        limit: 10,
      });

      expect(res).toHaveLength(1);
    });
  });

  describe('getDisruptionById', () => {
    it('should throw NotFoundException if disruption not found', async () => {
      repo.findDisruptionById.mockResolvedValue(null);

      await expect(service.getDisruptionById('disrupt-999')).rejects.toThrow(NotFoundException);
    });

    it('should return disruption details when found', async () => {
      repo.findDisruptionById.mockResolvedValue(getMockDisruption());

      const res = await service.getDisruptionById('disrupt-1');
      expect(res.id).toBe('disrupt-1');
    });
  });

  describe('updateDisruption', () => {
    it('should throw BadRequestException if disruption is already resolved', async () => {
      repo.findDisruptionById.mockResolvedValue({
        ...getMockDisruption(),
        status: 'RESOLVED',
      });

      await expect(service.updateDisruption('disrupt-1', { title: 'Updated' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should update disruption successfully', async () => {
      repo.findDisruptionById.mockResolvedValue(getMockDisruption());
      repo.saveDisruption.mockResolvedValue(undefined);

      const res = await service.updateDisruption('disrupt-1', {
        title: 'Updated title',
        severity: 'CRITICAL',
      });

      expect(res.title).toBe('Updated title');
      expect(res.severity).toBe('CRITICAL');
      expect(repo.saveDisruption).toHaveBeenCalled();
    });
  });

  describe('resolveDisruption', () => {
    it('should throw ConflictException if already resolved', async () => {
      repo.findDisruptionById.mockResolvedValue({
        ...getMockDisruption(),
        status: 'RESOLVED',
      });

      await expect(
        service.resolveDisruption('disrupt-1', { resolutionNotes: 'Fixed' }),
      ).rejects.toThrow(ConflictException);
    });

    it('should resolve disruption successfully', async () => {
      repo.findDisruptionById.mockResolvedValue(getMockDisruption());
      repo.saveDisruption.mockResolvedValue(undefined);

      const res = await service.resolveDisruption('disrupt-1', {
        resolutionNotes: 'Debris cleared, normal service resumed',
      });

      expect(res.status).toBe('RESOLVED');
      expect(res.resolutionNotes).toBe('Debris cleared, normal service resumed');
      expect(res.resolvedAt).toBeDefined();
    });
  });

  describe('deleteDisruption', () => {
    it('should delete disruption successfully', async () => {
      repo.findDisruptionById.mockResolvedValue(getMockDisruption());
      repo.deleteDisruption.mockResolvedValue(undefined);

      const res = await service.deleteDisruption('disrupt-1');
      expect(res.success).toBe(true);
      expect(repo.deleteDisruption).toHaveBeenCalledWith('disrupt-1', 'route-1', null);
    });
  });
});
