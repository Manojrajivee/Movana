import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TripProgressService } from './trip-progress.service';
import { TripProgressRepository } from '../repositories/trip-progress.repository';

describe('TripProgressService', () => {
  let service: TripProgressService;
  let repo: jest.Mocked<TripProgressRepository>;

  const mockTripDetail = {
    id: 'trip-1',
    trip_number: 'TRIP-101',
    route_id: 'route-1',
    route_code: 'DEL-JPR',
    route_name: 'Delhi to Jaipur High Speed',
    distance_km: 260.0,
    estimated_duration_minutes: 240,
    vehicle_id: 'veh-1',
    vehicle_code: 'BUS-01',
    registration_number: 'DL-01-A-1000',
    primary_driver_id: 'driver-1',
    driver_name: 'Rajesh Sharma',
    status: 'IN_TRANSIT',
    current_stop_id: 'stop-2',
    current_stop_name: 'Gurgaon Cyber Hub',
    current_latitude: 28.4595,
    current_longitude: 77.0266,
    delay_minutes: 5,
    scheduled_departure_at: new Date('2026-10-28T08:00:00Z'),
    scheduled_arrival_at: new Date('2026-10-28T12:00:00Z'),
    actual_departure_at: new Date('2026-10-28T08:05:00Z'),
    actual_arrival_at: null,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const mockStops = [
    {
      id: 'ts-1',
      trip_id: 'trip-1',
      stop_id: 'stop-1',
      sequence_number: 1,
      scheduled_arrival_at: new Date('2026-10-28T08:00:00Z'),
      scheduled_departure_at: new Date('2026-10-28T08:05:00Z'),
      actual_arrival_at: new Date('2026-10-28T08:02:00Z'),
      actual_departure_at: new Date('2026-10-28T08:05:00Z'),
      delay_minutes: 0,
      status: 'DEPARTED',
      stop_code: 'ISBT-KASHMERE',
      stop_name: 'Kashmere Gate ISBT',
      latitude: 28.6675,
      longitude: 77.2285,
    },
    {
      id: 'ts-2',
      trip_id: 'trip-1',
      stop_id: 'stop-2',
      sequence_number: 2,
      scheduled_arrival_at: new Date('2026-10-28T09:00:00Z'),
      scheduled_departure_at: new Date('2026-10-28T09:10:00Z'),
      actual_arrival_at: new Date('2026-10-28T09:05:00Z'),
      actual_departure_at: null,
      delay_minutes: 5,
      status: 'ARRIVED',
      stop_code: 'GUR-CYBER',
      stop_name: 'Gurgaon Cyber Hub',
      latitude: 28.4595,
      longitude: 77.0266,
    },
    {
      id: 'ts-3',
      trip_id: 'trip-1',
      stop_id: 'stop-3',
      sequence_number: 3,
      scheduled_arrival_at: new Date('2026-10-28T12:00:00Z'),
      scheduled_departure_at: new Date('2026-10-28T12:00:00Z'),
      actual_arrival_at: null,
      actual_departure_at: null,
      delay_minutes: 0,
      status: 'PENDING',
      stop_code: 'JPR-SINDHI',
      stop_name: 'Sindhi Camp ISBT Jaipur',
      latitude: 26.9239,
      longitude: 75.8016,
    },
  ];

  const mockMilestone = {
    id: 'event-1',
    trip_id: 'trip-1',
    vehicle_id: 'veh-1',
    driver_id: 'driver-1',
    event_type: 'CONGESTION_ENCOUNTERED',
    event_data: { severity: 'HIGH' },
    occurred_at: new Date(),
    created_at: new Date(),
  };

  beforeEach(async () => {
    const mockRepo: Partial<jest.Mocked<TripProgressRepository>> = {
      findTripProgressDetail: jest.fn(),
      findTripStops: jest.fn(),
      recordMilestoneEvent: jest.fn(),
      findTripMilestones: jest.fn(),
      countTripMilestones: jest.fn(),
      getActiveLiveBoard: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TripProgressService,
        {
          provide: TripProgressRepository,
          useValue: mockRepo,
        },
      ],
    }).compile();

    service = module.get<TripProgressService>(TripProgressService);
    repo = module.get(TripProgressRepository);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getTripProgress', () => {
    it('should throw NotFoundException if trip not found', async () => {
      repo.findTripProgressDetail.mockResolvedValue(null);

      await expect(service.getTripProgress('trip-999')).rejects.toThrow(NotFoundException);
    });

    it('should compute progress percentage and stop sequence correctly', async () => {
      repo.findTripProgressDetail.mockResolvedValue(mockTripDetail as any);
      repo.findTripStops.mockResolvedValue(mockStops as any);
      repo.countTripMilestones.mockResolvedValue(3);

      const res = await service.getTripProgress('trip-1');
      expect(res.tripId).toBe('trip-1');
      expect(res.progressPercentage).toBe(66.7); // 2 out of 3 stops completed = 66.7%
      expect(res.stopsSummary.total).toBe(3);
      expect(res.stopsSummary.completed).toBe(2);
      expect(res.stopsSummary.remaining).toBe(1);
      expect(res.stopsSummary.nextStop?.name).toBe('Sindhi Camp ISBT Jaipur');
      expect(res.stopsSummary.lastCompletedStop?.name).toBe('Gurgaon Cyber Hub');
      expect(res.distanceSummary.totalDistanceKm).toBe(260.0);
      expect(res.distanceSummary.distanceCoveredKm).toBe(173.33);
      expect(res.milestonesCount).toBe(3);
    });

    it('should return 100% progress when trip is COMPLETED', async () => {
      repo.findTripProgressDetail.mockResolvedValue({
        ...mockTripDetail,
        status: 'COMPLETED',
      } as any);
      repo.findTripStops.mockResolvedValue(mockStops as any);
      repo.countTripMilestones.mockResolvedValue(5);

      const res = await service.getTripProgress('trip-1');
      expect(res.progressPercentage).toBe(100.0);
    });

    it('should return 0% progress when trip is CANCELLED', async () => {
      repo.findTripProgressDetail.mockResolvedValue({
        ...mockTripDetail,
        status: 'CANCELLED',
      } as any);
      repo.findTripStops.mockResolvedValue(mockStops as any);
      repo.countTripMilestones.mockResolvedValue(1);

      const res = await service.getTripProgress('trip-1');
      expect(res.progressPercentage).toBe(0.0);
    });
  });

  describe('recordMilestone', () => {
    it('should throw NotFoundException if trip not found', async () => {
      repo.findTripProgressDetail.mockResolvedValue(null);

      await expect(
        service.recordMilestone('trip-999', { eventType: 'CHECKPOINT' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if trip is cancelled', async () => {
      repo.findTripProgressDetail.mockResolvedValue({
        ...mockTripDetail,
        status: 'CANCELLED',
      } as any);

      await expect(service.recordMilestone('trip-1', { eventType: 'CHECKPOINT' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should record milestone successfully', async () => {
      repo.findTripProgressDetail.mockResolvedValue(mockTripDetail as any);
      repo.recordMilestoneEvent.mockResolvedValue(mockMilestone as any);

      const res = await service.recordMilestone(
        'trip-1',
        {
          eventType: 'CONGESTION_ENCOUNTERED',
          eventData: { severity: 'HIGH' },
        },
        'user-1',
      );

      expect(res.event_type).toBe('CONGESTION_ENCOUNTERED');
      expect(repo.recordMilestoneEvent).toHaveBeenCalled();
    });
  });

  describe('getTripMilestones', () => {
    it('should throw NotFoundException if trip not found', async () => {
      repo.findTripProgressDetail.mockResolvedValue(null);

      await expect(service.getTripMilestones('trip-999', { limit: 10 })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return milestones for trip', async () => {
      repo.findTripProgressDetail.mockResolvedValue(mockTripDetail as any);
      repo.findTripMilestones.mockResolvedValue([mockMilestone as any]);

      const res = await service.getTripMilestones('trip-1', { limit: 10 });
      expect(res).toHaveLength(1);
      expect(res[0].event_type).toBe('CONGESTION_ENCOUNTERED');
    });
  });

  describe('getLiveBoard', () => {
    it('should return active trips live board with calculated progress percentage', async () => {
      repo.getActiveLiveBoard.mockResolvedValue([
        {
          trip_id: 'trip-1',
          trip_number: 'TRIP-101',
          route_code: 'DEL-JPR',
          route_name: 'Delhi to Jaipur',
          origin_stop: 'Delhi',
          destination_stop: 'Jaipur',
          vehicle_code: 'BUS-01',
          registration_number: 'DL-01-A-1000',
          primary_driver_name: 'Rajesh Sharma',
          trip_status: 'IN_TRANSIT',
          current_stop: 'Gurgaon',
          delay_minutes: 5,
          current_latitude: 28.4595,
          current_longitude: 77.0266,
          last_telemetry_at: new Date(),
          total_stops: 4,
          completed_stops: 2,
        },
      ]);

      const res = await service.getLiveBoard();
      expect(res).toHaveLength(1);
      expect(res[0].progressPercentage).toBe(50.0);
    });
  });
});
