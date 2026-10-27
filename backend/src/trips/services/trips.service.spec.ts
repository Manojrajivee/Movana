import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { TripsService } from './trips.service';
import { TripsRepository } from '../repositories/trips.repository';

describe('TripsService', () => {
  let service: TripsService;
  let repo: jest.Mocked<TripsRepository>;

  const mockTrip = {
    id: 'trip-1',
    trip_number: 'TRIP-101',
    route_id: 'route-1',
    schedule_id: 'sched-1',
    vehicle_id: 'veh-1',
    primary_driver_id: 'drv-1',
    secondary_driver_id: null,
    scheduled_departure_at: new Date('2026-10-28T08:00:00Z'),
    scheduled_arrival_at: new Date('2026-10-28T10:00:00Z'),
    actual_departure_at: null,
    actual_arrival_at: null,
    status: 'SCHEDULED',
    current_stop_id: null,
    current_latitude: null,
    current_longitude: null,
    delay_minutes: 0,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const mockSchedule = {
    id: 'sched-1',
    schedule_code: 'SCH-01',
    route_id: 'route-1',
    service_calendar_id: 'cal-1',
    departure_time: '08:00:00',
    arrival_time: '10:00:00',
    is_active: true,
  };

  const mockRoute = {
    id: 'route-1',
    route_code: 'R-100',
    name: 'Downtown Expressway',
    status: 'ACTIVE',
  };

  const mockScheduleStops = [
    {
      id: 'ss-1',
      schedule_id: 'sched-1',
      stop_id: 'stop-1',
      sequence_number: 1,
      scheduled_arrival_offset_minutes: 0,
      scheduled_departure_offset_minutes: 5,
    },
    {
      id: 'ss-2',
      schedule_id: 'sched-1',
      stop_id: 'stop-2',
      sequence_number: 2,
      scheduled_arrival_offset_minutes: 45,
      scheduled_departure_offset_minutes: 50,
    },
  ];

  const mockTripStops = [
    {
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
      created_at: new Date(),
      updated_at: new Date(),
    },
  ];

  beforeEach(async () => {
    const mockRepo: Partial<jest.Mocked<TripsRepository>> = {
      findTripById: jest.fn(),
      findTripByNumber: jest.fn(),
      findTripStops: jest.fn(),
      findScheduleById: jest.fn(),
      findScheduleStops: jest.fn(),
      findRouteById: jest.fn(),
      findRouteStops: jest.fn(),
      findVehicleById: jest.fn(),
      findDriverById: jest.fn(),
      queryTrips: jest.fn(),
      createTripWithStops: jest.fn(),
      updateTrip: jest.fn(),
      cancelTrip: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TripsService,
        {
          provide: TripsRepository,
          useValue: mockRepo,
        },
      ],
    }).compile();

    service = module.get<TripsService>(TripsService);
    repo = module.get(TripsRepository);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('dispatchSchedule', () => {
    it('should throw NotFoundException if schedule does not exist', async () => {
      repo.findScheduleById.mockResolvedValue(null);

      await expect(
        service.dispatchSchedule({
          scheduleId: 'sched-999',
          serviceDate: '2026-10-28',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if schedule is inactive', async () => {
      repo.findScheduleById.mockResolvedValue({
        ...mockSchedule,
        is_active: false,
      } as any);

      await expect(
        service.dispatchSchedule({
          scheduleId: 'sched-1',
          serviceDate: '2026-10-28',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if vehicle not found', async () => {
      repo.findScheduleById.mockResolvedValue(mockSchedule as any);
      repo.findVehicleById.mockResolvedValue(null);

      await expect(
        service.dispatchSchedule({
          scheduleId: 'sched-1',
          serviceDate: '2026-10-28',
          vehicleId: 'veh-999',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if vehicle is not active', async () => {
      repo.findScheduleById.mockResolvedValue(mockSchedule as any);
      repo.findVehicleById.mockResolvedValue({
        id: 'veh-1',
        registration_number: 'KA-01-AB-1234',
        status: 'MAINTENANCE',
      } as any);

      await expect(
        service.dispatchSchedule({
          scheduleId: 'sched-1',
          serviceDate: '2026-10-28',
          vehicleId: 'veh-1',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if primary and secondary drivers are identical', async () => {
      repo.findScheduleById.mockResolvedValue(mockSchedule as any);
      repo.findDriverById.mockResolvedValue({ id: 'drv-1', status: 'ACTIVE' } as any);

      await expect(
        service.dispatchSchedule({
          scheduleId: 'sched-1',
          serviceDate: '2026-10-28',
          primaryDriverId: 'drv-1',
          secondaryDriverId: 'drv-1',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException if trip number already exists', async () => {
      repo.findScheduleById.mockResolvedValue(mockSchedule as any);
      repo.findTripByNumber.mockResolvedValue(mockTrip as any);

      await expect(
        service.dispatchSchedule({
          scheduleId: 'sched-1',
          serviceDate: '2026-10-28',
          tripNumber: 'TRIP-101',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should successfully dispatch trip with schedule stops', async () => {
      repo.findScheduleById.mockResolvedValue(mockSchedule as any);
      repo.findTripByNumber.mockResolvedValue(null);
      repo.findScheduleStops.mockResolvedValue(mockScheduleStops as any);
      repo.createTripWithStops.mockResolvedValue(mockTrip as any);
      repo.findTripById.mockResolvedValue(mockTrip as any);
      repo.findTripStops.mockResolvedValue(mockTripStops as any);

      const result = await service.dispatchSchedule(
        {
          scheduleId: 'sched-1',
          serviceDate: '2026-10-28',
          tripNumber: 'TRIP-101',
        },
        'user-1',
      );

      expect(result.trip).toBeDefined();
      expect(result.trip.trip_number).toBe('TRIP-101');
      expect(result.stops).toHaveLength(1);
      expect(repo.createTripWithStops).toHaveBeenCalled();
    });
  });

  describe('createAdHocTrip', () => {
    it('should throw BadRequestException if arrival <= departure', async () => {
      await expect(
        service.createAdHocTrip({
          routeId: 'route-1',
          scheduledDepartureAt: '2026-10-28T10:00:00Z',
          scheduledArrivalAt: '2026-10-28T09:00:00Z',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if route not found', async () => {
      repo.findRouteById.mockResolvedValue(null);

      await expect(
        service.createAdHocTrip({
          routeId: 'route-999',
          scheduledDepartureAt: '2026-10-28T08:00:00Z',
          scheduledArrivalAt: '2026-10-28T10:00:00Z',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should create ad-hoc trip successfully', async () => {
      repo.findRouteById.mockResolvedValue(mockRoute as any);
      repo.findTripByNumber.mockResolvedValue(null);
      repo.findRouteStops.mockResolvedValue([
        {
          stop_id: 'stop-1',
          sequence_number: 1,
          arrival_offset_minutes: 0,
          departure_offset_minutes: 5,
        },
      ] as any);
      repo.createTripWithStops.mockResolvedValue(mockTrip as any);
      repo.findTripById.mockResolvedValue(mockTrip as any);
      repo.findTripStops.mockResolvedValue(mockTripStops as any);

      const result = await service.createAdHocTrip(
        {
          routeId: 'route-1',
          scheduledDepartureAt: '2026-10-28T08:00:00Z',
          scheduledArrivalAt: '2026-10-28T10:00:00Z',
        },
        'user-1',
      );

      expect(result.trip).toBeDefined();
      expect(repo.createTripWithStops).toHaveBeenCalled();
    });
  });

  describe('getTrips', () => {
    it('should return paginated trips', async () => {
      repo.queryTrips.mockResolvedValue({
        trips: [mockTrip as any],
        total: 1,
      });

      const result = await service.getTrips({ page: 1, limit: 10 });
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.totalPages).toBe(1);
    });
  });

  describe('getTripById and getTripStops', () => {
    it('should throw NotFoundException if trip does not exist', async () => {
      repo.findTripById.mockResolvedValue(null);

      await expect(service.getTripById('trip-999')).rejects.toThrow(NotFoundException);
      await expect(service.getTripStops('trip-999')).rejects.toThrow(NotFoundException);
    });

    it('should return trip with stops when found', async () => {
      repo.findTripById.mockResolvedValue(mockTrip as any);
      repo.findTripStops.mockResolvedValue(mockTripStops as any);

      const result = await service.getTripById('trip-1');
      expect(result.trip.id).toBe('trip-1');
      expect(result.stops).toHaveLength(1);
    });
  });

  describe('updateTrip', () => {
    it('should throw BadRequestException if trip is cancelled or completed', async () => {
      repo.findTripById.mockResolvedValue({
        ...mockTrip,
        status: 'CANCELLED',
      } as any);

      await expect(service.updateTrip('trip-1', {})).rejects.toThrow(BadRequestException);
    });

    it('should update trip successfully', async () => {
      repo.findTripById.mockResolvedValue(mockTrip as any);
      repo.updateTrip.mockResolvedValue({
        ...mockTrip,
        primary_driver_id: 'drv-2',
      } as any);
      repo.findDriverById.mockResolvedValue({ id: 'drv-2', status: 'ACTIVE' } as any);

      const result = await service.updateTrip('trip-1', {
        primaryDriverId: 'drv-2',
      });
      expect(result.primary_driver_id).toBe('drv-2');
    });
  });

  describe('cancelTrip', () => {
    it('should throw ConflictException if trip is already cancelled', async () => {
      repo.findTripById.mockResolvedValue({
        ...mockTrip,
        status: 'CANCELLED',
      } as any);

      await expect(service.cancelTrip('trip-1', { reason: 'Bus breakdown' })).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw BadRequestException if trip is completed', async () => {
      repo.findTripById.mockResolvedValue({
        ...mockTrip,
        status: 'COMPLETED',
      } as any);

      await expect(service.cancelTrip('trip-1', { reason: 'Bus breakdown' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should cancel trip and record reason', async () => {
      repo.findTripById.mockResolvedValue(mockTrip as any);
      repo.cancelTrip.mockResolvedValue({
        ...mockTrip,
        status: 'CANCELLED',
      } as any);

      const result = await service.cancelTrip(
        'trip-1',
        { reason: 'Severe weather alert' },
        'admin-1',
      );
      expect(result.status).toBe('CANCELLED');
      expect(repo.cancelTrip).toHaveBeenCalledWith('trip-1', 'Severe weather alert', 'admin-1');
    });
  });
});
