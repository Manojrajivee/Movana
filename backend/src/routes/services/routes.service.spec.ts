import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../../database/database.service';
import { RoutesRepository } from '../repositories/routes.repository';
import { RoutesService } from './routes.service';

describe('RoutesService', () => {
  let service: RoutesService;
  let repo: jest.Mocked<RoutesRepository>;
  let db: jest.Mocked<DatabaseService>;

  const originStopId = '11111111-1111-4111-a111-111111111111';
  const destinationStopId = '22222222-2222-4222-a222-222222222222';
  const routeId = '33333333-3333-4333-a333-333333333333';

  const mockOriginStop = {
    id: originStopId,
    stop_code: 'STOP-001',
    name: 'Central Railway Station',
    city: 'New Delhi',
    status: 'ACTIVE',
  };

  const mockDestinationStop = {
    id: destinationStopId,
    stop_code: 'STOP-002',
    name: 'Indira Gandhi International Airport',
    city: 'New Delhi',
    status: 'ACTIVE',
  };

  const mockRoute: any = {
    id: routeId,
    route_code: 'RT-101',
    name: 'Airport Express Corridor',
    description: 'High-speed corridor linking Central Station to Terminal 3',
    origin_stop_id: originStopId,
    destination_stop_id: destinationStopId,
    distance_km: 24.5,
    estimated_duration_minutes: 45,
    status: 'ACTIVE',
    created_at: new Date(),
    updated_at: new Date(),
    deleted_at: null,
    origin_stop_name: mockOriginStop.name,
    origin_stop_city: mockOriginStop.city,
    destination_stop_name: mockDestinationStop.name,
    destination_stop_city: mockDestinationStop.city,
    current_version_number: 1,
  };

  const mockVersion: any = {
    id: '44444444-4444-4444-a444-444444444444',
    route_id: routeId,
    version_number: 1,
    effective_from: '2026-01-01',
    effective_to: null,
    is_current: true,
    change_notes: 'Initial route topology creation',
    created_at: new Date(),
  };

  beforeEach(async () => {
    const mockRepo = {
      createRoute: jest.fn().mockResolvedValue(mockRoute),
      createRouteVersion: jest.fn().mockResolvedValue(mockVersion),
      findByCode: jest.fn().mockImplementation((code: string) => {
        if (code === mockRoute.route_code) return Promise.resolve(mockRoute);
        return Promise.resolve(null);
      }),
      findById: jest.fn().mockImplementation((id: string) => {
        if (id === routeId) return Promise.resolve(mockRoute);
        return Promise.resolve(null);
      }),
      findStopById: jest.fn().mockImplementation((id: string) => {
        if (id === originStopId) return Promise.resolve(mockOriginStop);
        if (id === destinationStopId) return Promise.resolve(mockDestinationStop);
        return Promise.resolve(null);
      }),
      findAll: jest.fn().mockResolvedValue({
        items: [mockRoute],
        total: 1,
      }),
      updateRoute: jest.fn().mockResolvedValue({
        ...mockRoute,
        name: 'Airport Express Corridor Revised',
      }),
      updateRouteStatus: jest.fn().mockResolvedValue({
        ...mockRoute,
        status: 'SUSPENDED',
      }),
      softDelete: jest.fn().mockResolvedValue({
        ...mockRoute,
        deleted_at: new Date(),
        status: 'INACTIVE',
      }),
      findVersionsByRouteId: jest.fn().mockResolvedValue([mockVersion]),
      getLatestVersionNumber: jest.fn().mockResolvedValue(1),
      deprecatePreviousVersions: jest.fn().mockResolvedValue(undefined),
    };

    const mockDb = {
      withTransaction: jest.fn().mockImplementation(async (callback) => {
        const client = {};
        return callback(client);
      }),
      query: jest.fn().mockResolvedValue({ rows: [] }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoutesService,
        { provide: RoutesRepository, useValue: mockRepo },
        { provide: DatabaseService, useValue: mockDb },
      ],
    }).compile();

    service = module.get<RoutesService>(RoutesService);
    repo = module.get(RoutesRepository);
    db = module.get(DatabaseService);
  });

  describe('createRoute', () => {
    it('creates route and initial version inside transaction', async () => {
      const result = await service.createRoute({
        routeCode: 'RT-102',
        name: 'City North Link',
        originStopId,
        destinationStopId,
        distanceKm: 15.2,
        estimatedDurationMinutes: 30,
      });

      expect(result).toBeDefined();
      expect(db.withTransaction).toHaveBeenCalled();
      expect(repo.createRoute).toHaveBeenCalled();
      expect(repo.createRouteVersion).toHaveBeenCalledWith(
        expect.objectContaining({
          versionNumber: 1,
          isCurrent: true,
        }),
        expect.anything(),
      );
    });

    it('throws ConflictException if routeCode already exists', async () => {
      await expect(
        service.createRoute({
          routeCode: mockRoute.route_code,
          name: 'Existing',
          originStopId,
          destinationStopId,
          distanceKm: 10,
          estimatedDurationMinutes: 20,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('throws BadRequestException if originStopId equals destinationStopId', async () => {
      await expect(
        service.createRoute({
          routeCode: 'RT-999',
          name: 'Circular Bad Route',
          originStopId,
          destinationStopId: originStopId,
          distanceKm: 10,
          estimatedDurationMinutes: 20,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException if originStop does not exist', async () => {
      await expect(
        service.createRoute({
          routeCode: 'RT-999',
          name: 'Route Missing Origin',
          originStopId: '00000000-0000-0000-0000-000000000000',
          destinationStopId,
          distanceKm: 10,
          estimatedDurationMinutes: 20,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException if destinationStop does not exist', async () => {
      await expect(
        service.createRoute({
          routeCode: 'RT-999',
          name: 'Route Missing Dest',
          originStopId,
          destinationStopId: '00000000-0000-0000-0000-000000000000',
          distanceKm: 10,
          estimatedDurationMinutes: 20,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getRoutes', () => {
    it('returns paginated routes list', async () => {
      const result = await service.getRoutes({ limit: 10, offset: 0 });
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });

  describe('getRouteById', () => {
    it('returns route if found and not deleted', async () => {
      const result = await service.getRouteById(routeId);
      expect(result.id).toBe(routeId);
    });

    it('throws NotFoundException if route not found', async () => {
      await expect(service.getRouteById('non-existent')).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException if route is soft-deleted', async () => {
      repo.findById.mockResolvedValueOnce({
        ...mockRoute,
        deleted_at: new Date(),
      });
      await expect(service.getRouteById(routeId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateRoute', () => {
    it('updates route fields', async () => {
      const result = await service.updateRoute(routeId, {
        name: 'Airport Express Corridor Revised',
      });
      expect(result.name).toBe('Airport Express Corridor Revised');
    });

    it('throws NotFoundException when route not found', async () => {
      await expect(service.updateRoute('non-existent', { name: 'New Name' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateRouteStatus', () => {
    it('updates route status successfully', async () => {
      const result = await service.updateRouteStatus(routeId, { status: 'SUSPENDED' });
      expect(result.status).toBe('SUSPENDED');
    });
  });

  describe('deleteRoute', () => {
    it('soft-deletes route successfully', async () => {
      const result = await service.deleteRoute(routeId);
      expect(result.deleted_at).toBeDefined();
    });
  });

  describe('createRouteVersion', () => {
    it('creates next version increment and deprecates previous versions', async () => {
      repo.createRouteVersion.mockResolvedValueOnce({
        ...mockVersion,
        version_number: 2,
        change_notes: 'Updated geometry for new highway extension',
      });

      const result = await service.createRouteVersion(routeId, {
        changeNotes: 'Updated geometry for new highway extension',
      });

      expect(result.version_number).toBe(2);
      expect(repo.deprecatePreviousVersions).toHaveBeenCalledWith(routeId, expect.anything());
    });
  });

  describe('getRouteVersions', () => {
    it('returns version history for route', async () => {
      const versions = await service.getRouteVersions(routeId);
      expect(versions).toHaveLength(1);
      expect(versions[0].version_number).toBe(1);
    });
  });
});
