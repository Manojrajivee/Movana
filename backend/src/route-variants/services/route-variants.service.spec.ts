import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../../database/database.service';
import { RouteVariantsRepository } from '../repositories/route-variants.repository';
import { RouteVariantsService } from './route-variants.service';

describe('RouteVariantsService', () => {
  let service: RouteVariantsService;
  let repo: jest.Mocked<RouteVariantsRepository>;
  let db: jest.Mocked<DatabaseService>;

  const routeId = '11111111-1111-4111-a111-111111111111';
  const stop1Id = '22222222-2222-4222-a222-222222222222';
  const stop2Id = '33333333-3333-4333-a333-333333333333';

  const mockRouteStop1: any = {
    id: '44444444-4444-4444-a444-444444444444',
    route_id: routeId,
    stop_id: stop1Id,
    sequence_number: 1,
    arrival_offset_minutes: 0,
    departure_offset_minutes: 5,
    distance_from_origin_km: 0.0,
    is_boarding_allowed: true,
    is_dropoff_allowed: false,
    created_at: new Date(),
    updated_at: new Date(),
    stop_code: 'DEL-01',
    stop_name: 'Kashmere Gate',
    stop_address: 'Ring Road',
    stop_city: 'New Delhi',
    latitude: 28.6665,
    longitude: 77.2333,
  };

  const mockRouteStop2: any = {
    id: '55555555-5555-4555-a555-555555555555',
    route_id: routeId,
    stop_id: stop2Id,
    sequence_number: 2,
    arrival_offset_minutes: 25,
    departure_offset_minutes: 30,
    distance_from_origin_km: 15.5,
    is_boarding_allowed: true,
    is_dropoff_allowed: true,
    created_at: new Date(),
    updated_at: new Date(),
    stop_code: 'DEL-02',
    stop_name: 'Dhaula Kuan',
    stop_address: 'NH 48',
    stop_city: 'New Delhi',
    latitude: 28.5921,
    longitude: 77.1614,
  };

  beforeEach(async () => {
    const mockRepo = {
      addRouteStop: jest.fn().mockResolvedValue(mockRouteStop1),
      findRouteStop: jest.fn().mockImplementation((rId: string, sId: string) => {
        if (rId === routeId && sId === stop1Id) return Promise.resolve(mockRouteStop1);
        if (rId === routeId && sId === stop2Id) return Promise.resolve(mockRouteStop2);
        return Promise.resolve(null);
      }),
      findBySequence: jest.fn().mockImplementation((rId: string, seq: number) => {
        if (rId === routeId && seq === 1) return Promise.resolve(mockRouteStop1);
        if (rId === routeId && seq === 2) return Promise.resolve(mockRouteStop2);
        return Promise.resolve(null);
      }),
      findStopsByRouteId: jest.fn().mockResolvedValue([mockRouteStop1, mockRouteStop2]),
      updateRouteStop: jest.fn().mockResolvedValue({
        ...mockRouteStop1,
        departure_offset_minutes: 10,
      }),
      deleteRouteStop: jest.fn().mockResolvedValue(mockRouteStop1),
      updateStopSequence: jest.fn().mockResolvedValue(undefined),
      checkRouteExists: jest.fn().mockImplementation((id: string) => {
        return Promise.resolve(id === routeId);
      }),
      checkStopExists: jest.fn().mockImplementation((id: string) => {
        return Promise.resolve(id === stop1Id || id === stop2Id || id === 'valid-stop-3');
      }),
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
        RouteVariantsService,
        { provide: RouteVariantsRepository, useValue: mockRepo },
        { provide: DatabaseService, useValue: mockDb },
      ],
    }).compile();

    service = module.get<RouteVariantsService>(RouteVariantsService);
    repo = module.get(RouteVariantsRepository);
    db = module.get(DatabaseService);
  });

  describe('addRouteStop', () => {
    it('adds a stop to route sequence successfully', async () => {
      repo.findBySequence.mockResolvedValueOnce(null);
      repo.findRouteStop.mockResolvedValueOnce(null);

      const result = await service.addRouteStop(routeId, {
        stopId: 'valid-stop-3',
        sequenceNumber: 3,
        arrivalOffsetMinutes: 40,
        departureOffsetMinutes: 45,
        distanceFromOriginKm: 25.0,
      });

      expect(result).toBeDefined();
      expect(repo.addRouteStop).toHaveBeenCalled();
    });

    it('throws NotFoundException if route does not exist', async () => {
      await expect(
        service.addRouteStop('non-existent-route', {
          stopId: stop1Id,
          sequenceNumber: 1,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException if stop does not exist', async () => {
      await expect(
        service.addRouteStop(routeId, {
          stopId: 'non-existent-stop',
          sequenceNumber: 3,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException if stop already in route sequence', async () => {
      await expect(
        service.addRouteStop(routeId, {
          stopId: stop1Id,
          sequenceNumber: 3,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException if sequenceNumber already occupied', async () => {
      repo.findRouteStop.mockResolvedValueOnce(null);

      await expect(
        service.addRouteStop(routeId, {
          stopId: 'valid-stop-3',
          sequenceNumber: 1,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('getStopsByRouteId', () => {
    it('returns ordered stops list', async () => {
      const stops = await service.getStopsByRouteId(routeId);
      expect(stops).toHaveLength(2);
      expect(stops[0].sequence_number).toBe(1);
      expect(stops[1].sequence_number).toBe(2);
    });
  });

  describe('getRouteStop', () => {
    it('returns route stop by stopId', async () => {
      const stop = await service.getRouteStop(routeId, stop1Id);
      expect(stop.stop_id).toBe(stop1Id);
    });

    it('throws NotFoundException if stop not on route', async () => {
      await expect(service.getRouteStop(routeId, 'missing-stop')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateRouteStop', () => {
    it('updates stop timing offsets successfully', async () => {
      const result = await service.updateRouteStop(routeId, stop1Id, {
        departureOffsetMinutes: 10,
      });
      expect(result.departure_offset_minutes).toBe(10);
    });

    it('throws BadRequestException if departureOffset < arrivalOffset', async () => {
      await expect(
        service.updateRouteStop(routeId, stop2Id, {
          departureOffsetMinutes: 10, // arrival is 25
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('deleteRouteStop', () => {
    it('removes stop from route alignment', async () => {
      const result = await service.deleteRouteStop(routeId, stop1Id);
      expect(result.stop_id).toBe(stop1Id);
      expect(repo.deleteRouteStop).toHaveBeenCalledWith(routeId, stop1Id);
    });
  });

  describe('reorderRouteStops', () => {
    it('reorders sequence numbers inside transaction', async () => {
      const result = await service.reorderRouteStops(routeId, {
        stops: [
          { stopId: stop2Id, sequenceNumber: 1 },
          { stopId: stop1Id, sequenceNumber: 2 },
        ],
      });

      expect(result).toHaveLength(2);
      expect(db.withTransaction).toHaveBeenCalled();
      expect(repo.updateStopSequence).toHaveBeenCalledTimes(4); // 2 negative temp + 2 positive target
    });

    it('throws BadRequestException if stop count differs from route stop count', async () => {
      await expect(
        service.reorderRouteStops(routeId, {
          stops: [{ stopId: stop1Id, sequenceNumber: 1 }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException if stop does not belong to route', async () => {
      await expect(
        service.reorderRouteStops(routeId, {
          stops: [
            { stopId: stop1Id, sequenceNumber: 1 },
            { stopId: 'foreign-stop', sequenceNumber: 2 },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getAlignmentSummary', () => {
    it('calculates alignment statistics correctly', async () => {
      const summary = await service.getAlignmentSummary(routeId);
      expect(summary.routeId).toBe(routeId);
      expect(summary.totalStops).toBe(2);
      expect(summary.maxDistanceFromOriginKm).toBe(15.5);
      expect(summary.totalDurationOffsetMinutes).toBe(30);
      expect(summary.boardingStopsCount).toBe(2);
      expect(summary.dropoffStopsCount).toBe(1);
    });
  });
});
