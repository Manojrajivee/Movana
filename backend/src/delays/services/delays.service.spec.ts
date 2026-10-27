import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { DelaysService } from './delays.service';
import { DelaysRepository } from '../repositories/delays.repository';

describe('DelaysService', () => {
  let service: DelaysService;
  let repo: jest.Mocked<DelaysRepository>;

  const mockTrip = {
    trip_id: 'trip-100',
    trip_number: 'TRIP-100',
    route_id: 'route-1',
    route_code: 'R10',
    route_name: 'Downtown Loop',
    vehicle_id: 'veh-1',
    vehicle_code: 'BUS-01',
    primary_driver_id: 'driver-1',
    status: 'IN_TRANSIT',
    delay_minutes: 0,
    scheduled_departure_at: new Date(Date.now() - 30 * 60 * 1000),
    scheduled_arrival_at: new Date(Date.now() + 30 * 60 * 1000),
    actual_departure_at: new Date(Date.now() - 30 * 60 * 1000),
    actual_arrival_at: null,
  };

  beforeEach(async () => {
    const mockRepo: Partial<jest.Mocked<DelaysRepository>> = {
      findTripForDelay: jest.fn(),
      updateTripDelay: jest.fn(),
      recordTripEvent: jest.fn().mockResolvedValue(undefined),
      recordTripStatusHistory: jest.fn().mockResolvedValue(undefined),
      findActiveDelayedTrips: jest.fn(),
      getDelaySummary: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DelaysService,
        {
          provide: DelaysRepository,
          useValue: mockRepo,
        },
      ],
    }).compile();

    service = module.get<DelaysService>(DelaysService);
    repo = module.get(DelaysRepository);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('detectTripDelay', () => {
    it('should throw NotFoundException if trip not found', async () => {
      repo.findTripForDelay.mockResolvedValue(null);

      await expect(service.detectTripDelay('non-existent-trip', {})).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should transition trip to DELAYED and record event when delay exceeds threshold', async () => {
      repo.findTripForDelay.mockResolvedValue(mockTrip as any);
      repo.updateTripDelay.mockResolvedValue({
        ...mockTrip,
        delay_minutes: 12,
        status: 'DELAYED',
      } as any);

      const res = await service.detectTripDelay(
        'trip-100',
        { simulatedDelayMinutes: 12, thresholdMinutes: 5, reason: 'Heavy traffic' },
        'user-1',
      );

      expect(res.isDelayed).toBe(true);
      expect(res.status).toBe('DELAYED');
      expect(res.delayMinutes).toBe(12);
      expect(res.statusChanged).toBe(true);

      expect(repo.updateTripDelay).toHaveBeenCalledWith('trip-100', 12, 'DELAYED');
      expect(repo.recordTripEvent).toHaveBeenCalledWith(
        'trip-100',
        'veh-1',
        'driver-1',
        'DELAY_DETECTED',
        expect.objectContaining({
          previousDelay: 0,
          newDelay: 12,
          thresholdMinutes: 5,
          reason: 'Heavy traffic',
        }),
      );
      expect(repo.recordTripStatusHistory).toHaveBeenCalledWith(
        'trip-100',
        'IN_TRANSIT',
        'DELAYED',
        'Heavy traffic',
        'user-1',
      );
    });

    it('should update delay minutes if already DELAYED', async () => {
      const alreadyDelayedTrip = {
        ...mockTrip,
        status: 'DELAYED',
        delay_minutes: 8,
      };
      repo.findTripForDelay.mockResolvedValue(alreadyDelayedTrip as any);
      repo.updateTripDelay.mockResolvedValue({
        ...alreadyDelayedTrip,
        delay_minutes: 15,
      } as any);

      const res = await service.detectTripDelay('trip-100', {
        simulatedDelayMinutes: 15,
        thresholdMinutes: 5,
      });

      expect(res.isDelayed).toBe(true);
      expect(res.status).toBe('DELAYED');
      expect(res.delayMinutes).toBe(15);
      expect(res.statusChanged).toBe(false);

      expect(repo.updateTripDelay).toHaveBeenCalledWith('trip-100', 15);
      expect(repo.recordTripEvent).toHaveBeenCalledWith(
        'trip-100',
        'veh-1',
        'driver-1',
        'DELAY_UPDATED',
        expect.objectContaining({
          previousDelay: 8,
          newDelay: 15,
        }),
      );
    });

    it('should resolve delay and revert status when delay falls below threshold', async () => {
      const delayedTrip = {
        ...mockTrip,
        status: 'DELAYED',
        delay_minutes: 10,
      };
      repo.findTripForDelay.mockResolvedValue(delayedTrip as any);
      repo.updateTripDelay.mockResolvedValue({
        ...delayedTrip,
        delay_minutes: 2,
        status: 'IN_TRANSIT',
      } as any);

      const res = await service.detectTripDelay('trip-100', {
        simulatedDelayMinutes: 2,
        thresholdMinutes: 5,
      });

      expect(res.isDelayed).toBe(false);
      expect(res.status).toBe('IN_TRANSIT');
      expect(res.delayMinutes).toBe(2);
      expect(res.statusChanged).toBe(true);

      expect(repo.updateTripDelay).toHaveBeenCalledWith('trip-100', 2, 'IN_TRANSIT');
      expect(repo.recordTripEvent).toHaveBeenCalledWith(
        'trip-100',
        'veh-1',
        'driver-1',
        'DELAY_RESOLVED',
        expect.anything(),
      );
      expect(repo.recordTripStatusHistory).toHaveBeenCalledWith(
        'trip-100',
        'DELAYED',
        'IN_TRANSIT',
        'Trip recovered schedule',
        null,
      );
    });
  });

  describe('getActiveDelays', () => {
    it('should return paginated active delays', async () => {
      const mockResult = {
        items: [
          {
            trip_id: 'trip-100',
            trip_number: 'TRIP-100',
            route_id: 'route-1',
            route_code: 'R10',
            route_name: 'Downtown Loop',
            vehicle_id: 'veh-1',
            vehicle_code: 'BUS-01',
            status: 'DELAYED',
            delay_minutes: 15,
            scheduled_departure_at: new Date(),
            scheduled_arrival_at: new Date(),
            current_latitude: 40.71,
            current_longitude: -74.0,
          },
        ],
        total: 1,
      };

      repo.findActiveDelayedTrips.mockResolvedValue(mockResult);

      const res = await service.getActiveDelays({ page: 1, limit: 10 });
      expect(res.items).toHaveLength(1);
      expect(res.total).toBe(1);
      expect(res.page).toBe(1);
      expect(res.totalPages).toBe(1);
    });
  });

  describe('getDelaySummary', () => {
    it('should return network summary', async () => {
      const summary = {
        totalActiveTrips: 20,
        delayedTripsCount: 4,
        onTimeTripsCount: 16,
        onTimePerformanceRate: 80.0,
        averageDelayMinutes: 8.5,
        maxDelayMinutes: 22,
        topDelayedRoutes: [
          {
            route_id: 'r1',
            route_code: 'R10',
            route_name: 'Loop',
            delayed_trips: 3,
            average_delay: 9.0,
          },
        ],
      };
      repo.getDelaySummary.mockResolvedValue(summary);

      const res = await service.getDelaySummary();
      expect(res).toBe(summary);
      expect(res.onTimePerformanceRate).toBe(80.0);
    });
  });

  describe('resolveTripDelay', () => {
    it('should throw NotFoundException if trip not found', async () => {
      repo.findTripForDelay.mockResolvedValue(null);

      await expect(
        service.resolveTripDelay('trip-not-found', {
          resolutionNotes: 'Clearing delay',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should manually resolve delay and record resolution', async () => {
      const delayedTrip = {
        ...mockTrip,
        status: 'DELAYED',
        delay_minutes: 15,
      };
      repo.findTripForDelay.mockResolvedValue(delayedTrip as any);
      repo.updateTripDelay.mockResolvedValue({
        ...delayedTrip,
        delay_minutes: 0,
        status: 'IN_TRANSIT',
      } as any);

      const res = await service.resolveTripDelay(
        'trip-100',
        {
          resolutionNotes: 'Substituted relief bus; delay resolved',
          newStatus: 'IN_TRANSIT',
          delayMinutes: 0,
        },
        'operator-1',
      );

      expect(res.tripId).toBe('trip-100');
      expect(res.previousStatus).toBe('DELAYED');
      expect(res.newStatus).toBe('IN_TRANSIT');
      expect(res.previousDelayMinutes).toBe(15);
      expect(res.resolvedDelayMinutes).toBe(0);
      expect(res.resolutionNotes).toBe('Substituted relief bus; delay resolved');

      expect(repo.updateTripDelay).toHaveBeenCalledWith('trip-100', 0, 'IN_TRANSIT');
      expect(repo.recordTripEvent).toHaveBeenCalledWith(
        'trip-100',
        'veh-1',
        'driver-1',
        'DELAY_MANUALLY_RESOLVED',
        expect.objectContaining({
          previousDelay: 15,
          newDelay: 0,
          resolutionNotes: 'Substituted relief bus; delay resolved',
          resolvedBy: 'operator-1',
        }),
      );
      expect(repo.recordTripStatusHistory).toHaveBeenCalledWith(
        'trip-100',
        'DELAYED',
        'IN_TRANSIT',
        'Substituted relief bus; delay resolved',
        'operator-1',
      );
    });
  });
});
