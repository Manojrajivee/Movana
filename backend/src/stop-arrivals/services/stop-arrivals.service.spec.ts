import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { StopArrivalsService } from './stop-arrivals.service';
import { StopArrivalsRepository } from '../repositories/stop-arrivals.repository';

describe('StopArrivalsService', () => {
  let service: StopArrivalsService;
  let repo: jest.Mocked<StopArrivalsRepository>;

  const mockTrip = {
    id: 'trip-1',
    trip_number: 'TRIP-101',
    route_code: 'DEL-JPR',
    route_name: 'Delhi to Jaipur',
    status: 'IN_TRANSIT',
  };

  const mockTripStopPending = {
    id: 'ts-1',
    trip_id: 'trip-1',
    stop_id: 'stop-1',
    sequence_number: 1,
    scheduled_arrival_at: new Date('2026-10-28T08:00:00Z'),
    scheduled_departure_at: new Date('2026-10-28T08:05:00Z'),
    actual_arrival_at: null,
    actual_departure_at: null,
    delay_minutes: 0,
    status: 'PENDING',
    stop_code: 'ISBT-DEL',
    stop_name: 'Kashmere Gate ISBT',
    latitude: 28.6675,
    longitude: 77.2285,
    city: 'Delhi',
    created_at: new Date(),
    updated_at: new Date(),
  };

  const mockTripStopArrived = {
    ...mockTripStopPending,
    status: 'ARRIVED',
    actual_arrival_at: new Date('2026-10-28T08:02:00Z'),
  };

  beforeEach(async () => {
    const mockRepo: Partial<jest.Mocked<StopArrivalsRepository>> = {
      findTripById: jest.fn(),
      findTripStop: jest.fn(),
      findAllTripStops: jest.fn(),
      findStopById: jest.fn(),
      recordArrivalTransactional: jest.fn(),
      recordDepartureTransactional: jest.fn(),
      recordSkipTransactional: jest.fn(),
      findRecentStopArrivals: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StopArrivalsService,
        {
          provide: StopArrivalsRepository,
          useValue: mockRepo,
        },
      ],
    }).compile();

    service = module.get<StopArrivalsService>(StopArrivalsService);
    repo = module.get(StopArrivalsRepository);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('recordArrival', () => {
    it('should throw NotFoundException if trip not found', async () => {
      repo.findTripById.mockResolvedValue(null);

      await expect(service.recordArrival('trip-999', 'stop-1', {})).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException if trip is completed or cancelled', async () => {
      repo.findTripById.mockResolvedValue({
        ...mockTrip,
        status: 'COMPLETED',
      } as any);

      await expect(service.recordArrival('trip-1', 'stop-1', {})).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException if stop not found in trip', async () => {
      repo.findTripById.mockResolvedValue(mockTrip as any);
      repo.findTripStop.mockResolvedValue(null);

      await expect(service.recordArrival('trip-1', 'stop-999', {})).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ConflictException if stop has already arrived', async () => {
      repo.findTripById.mockResolvedValue(mockTrip as any);
      repo.findTripStop.mockResolvedValue(mockTripStopArrived as any);

      await expect(service.recordArrival('trip-1', 'stop-1', {})).rejects.toThrow(
        ConflictException,
      );
    });

    it('should record arrival successfully and calculate delay', async () => {
      repo.findTripById.mockResolvedValue(mockTrip as any);
      repo.findTripStop.mockResolvedValue(mockTripStopPending as any);
      repo.recordArrivalTransactional.mockResolvedValue(mockTripStopArrived as any);

      const res = await service.recordArrival(
        'trip-1',
        'stop-1',
        { arrivedAt: '2026-10-28T08:02:00Z', notes: 'Platform 3' },
        'driver-1',
      );

      expect(res.status).toBe('ARRIVED');
      expect(repo.recordArrivalTransactional).toHaveBeenCalledWith(
        'trip-1',
        'stop-1',
        expect.any(Date),
        2, // 2 minutes delay
        'Platform 3',
        'driver-1',
      );
    });
  });

  describe('recordDeparture', () => {
    it('should throw BadRequestException if stop is still PENDING', async () => {
      repo.findTripById.mockResolvedValue(mockTrip as any);
      repo.findTripStop.mockResolvedValue(mockTripStopPending as any);

      await expect(service.recordDeparture('trip-1', 'stop-1', {})).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException if departure time is before arrival time', async () => {
      repo.findTripById.mockResolvedValue(mockTrip as any);
      repo.findTripStop.mockResolvedValue(mockTripStopArrived as any);

      await expect(
        service.recordDeparture('trip-1', 'stop-1', {
          departedAt: '2026-10-28T08:00:00Z',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should record departure successfully and detect first and last stops', async () => {
      repo.findTripById.mockResolvedValue(mockTrip as any);
      repo.findTripStop.mockResolvedValue(mockTripStopArrived as any);
      repo.findAllTripStops.mockResolvedValue([
        mockTripStopArrived as any,
        { sequence_number: 2 } as any,
      ]);
      repo.recordDepartureTransactional.mockResolvedValue({
        ...mockTripStopArrived,
        status: 'DEPARTED',
      } as any);

      const res = await service.recordDeparture(
        'trip-1',
        'stop-1',
        { departedAt: '2026-10-28T08:05:00Z' },
        'driver-1',
      );

      expect(res.status).toBe('DEPARTED');
      expect(repo.recordDepartureTransactional).toHaveBeenCalledWith(
        'trip-1',
        'stop-1',
        expect.any(Date),
        true, // isFirstStop
        false, // isLastStop
        undefined,
        'driver-1',
      );
    });
  });

  describe('recordSkip', () => {
    it('should throw ConflictException if stop already departed or arrived', async () => {
      repo.findTripById.mockResolvedValue(mockTrip as any);
      repo.findTripStop.mockResolvedValue(mockTripStopArrived as any);

      await expect(
        service.recordSkip('trip-1', 'stop-1', { reason: 'Traffic jam' }),
      ).rejects.toThrow(ConflictException);
    });

    it('should record skipped stop successfully', async () => {
      repo.findTripById.mockResolvedValue(mockTrip as any);
      repo.findTripStop.mockResolvedValue(mockTripStopPending as any);
      repo.recordSkipTransactional.mockResolvedValue({
        ...mockTripStopPending,
        status: 'SKIPPED',
      } as any);

      const res = await service.recordSkip(
        'trip-1',
        'stop-1',
        { reason: 'Road under construction' },
        'operator-1',
      );

      expect(res.status).toBe('SKIPPED');
      expect(repo.recordSkipTransactional).toHaveBeenCalledWith(
        'trip-1',
        'stop-1',
        'Road under construction',
        'operator-1',
      );
    });
  });

  describe('getTripTimeline', () => {
    it('should return trip stops timeline and dwell times', async () => {
      repo.findTripById.mockResolvedValue(mockTrip as any);
      repo.findAllTripStops.mockResolvedValue([
        {
          ...mockTripStopArrived,
          actual_departure_at: new Date('2026-10-28T08:05:00Z'),
          status: 'DEPARTED',
        } as any,
        mockTripStopPending as any,
      ]);

      const res = await service.getTripTimeline('trip-1');
      expect(res.tripId).toBe('trip-1');
      expect(res.summary.totalStops).toBe(2);
      expect(res.summary.departedStops).toBe(1);
      expect(res.summary.pendingStops).toBe(1);
      expect(res.stops[0].dwellTimeSeconds).toBe(180); // 3 minutes dwell = 180s
    });
  });

  describe('getRecentStopArrivals', () => {
    it('should throw NotFoundException if stop not found', async () => {
      repo.findStopById.mockResolvedValue(null);

      await expect(
        service.getRecentStopArrivals('stop-999', { hours: 4, limit: 10 }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return recent stop arrivals', async () => {
      repo.findStopById.mockResolvedValue({ id: 'stop-1' } as any);
      repo.findRecentStopArrivals.mockResolvedValue([
        {
          trip_stop_id: 'ts-1',
          trip_id: 'trip-1',
          trip_number: 'TRIP-101',
          route_code: 'DEL-JPR',
          route_name: 'Delhi to Jaipur',
          vehicle_code: 'BUS-01',
          sequence_number: 1,
          scheduled_arrival_at: new Date(),
          scheduled_departure_at: new Date(),
          actual_arrival_at: new Date(),
          actual_departure_at: null,
          delay_minutes: 2,
          status: 'ARRIVED',
        },
      ]);

      const res = await service.getRecentStopArrivals('stop-1', {
        hours: 4,
        limit: 10,
      });
      expect(res).toHaveLength(1);
      expect(res[0].trip_number).toBe('TRIP-101');
    });
  });
});
