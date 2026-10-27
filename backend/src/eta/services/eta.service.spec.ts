import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { EtaService } from './eta.service';
import { EtaRepository } from '../repositories/eta.repository';

describe('EtaService', () => {
  let service: EtaService;
  let repo: jest.Mocked<EtaRepository>;

  const mockTrip = {
    trip_id: 'trip-1111',
    trip_number: 'TRIP-101',
    route_id: 'route-1',
    route_code: 'R10',
    route_name: 'Downtown Loop',
    vehicle_id: 'veh-1',
    vehicle_code: 'BUS-001',
    vehicle_lat: 40.7128,
    vehicle_lon: -74.006,
    trip_lat: 40.7128,
    trip_lon: -74.006,
    status: 'IN_TRANSIT',
    delay_minutes: 2,
    scheduled_departure_at: new Date(Date.now() - 1000 * 60 * 15),
    scheduled_arrival_at: new Date(Date.now() + 1000 * 60 * 45),
  };

  const mockStops = [
    {
      id: 'ts-1',
      trip_id: 'trip-1111',
      stop_id: 'stop-1',
      sequence_number: 1,
      scheduled_arrival_at: new Date(Date.now() - 1000 * 60 * 10),
      scheduled_departure_at: new Date(Date.now() - 1000 * 60 * 8),
      actual_arrival_at: new Date(Date.now() - 1000 * 60 * 10),
      actual_departure_at: new Date(Date.now() - 1000 * 60 * 8),
      delay_minutes: 0,
      status: 'DEPARTED',
      stop_code: 'ST-01',
      stop_name: 'Central Station',
      latitude: 40.7128,
      longitude: -74.006,
    },
    {
      id: 'ts-2',
      trip_id: 'trip-1111',
      stop_id: 'stop-2',
      sequence_number: 2,
      scheduled_arrival_at: new Date(Date.now() + 1000 * 60 * 15),
      scheduled_departure_at: new Date(Date.now() + 1000 * 60 * 17),
      actual_arrival_at: null,
      actual_departure_at: null,
      delay_minutes: 0,
      status: 'PENDING',
      stop_code: 'ST-02',
      stop_name: 'Market Street',
      latitude: 40.72,
      longitude: -74.01,
    },
    {
      id: 'ts-3',
      trip_id: 'trip-1111',
      stop_id: 'stop-3',
      sequence_number: 3,
      scheduled_arrival_at: new Date(Date.now() + 1000 * 60 * 30),
      scheduled_departure_at: new Date(Date.now() + 1000 * 60 * 32),
      actual_arrival_at: null,
      actual_departure_at: null,
      delay_minutes: 0,
      status: 'PENDING',
      stop_code: 'ST-03',
      stop_name: 'North Harbor',
      latitude: 40.73,
      longitude: -74.015,
    },
  ];

  beforeEach(async () => {
    const mockRepo: Partial<jest.Mocked<EtaRepository>> = {
      findTripForEta: jest.fn(),
      findTripStopsForEta: jest.fn(),
      findApproachingTripsForStop: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EtaService,
        {
          provide: EtaRepository,
          useValue: mockRepo,
        },
      ],
    }).compile();

    service = module.get<EtaService>(EtaService);
    repo = module.get(EtaRepository);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getTripEta', () => {
    it('should throw NotFoundException when trip does not exist', async () => {
      repo.findTripForEta.mockResolvedValue(null);

      await expect(service.getTripEta('unknown-trip')).rejects.toThrow(NotFoundException);
      expect(repo.findTripForEta).toHaveBeenCalledWith('unknown-trip');
    });

    it('should calculate ETA for all stops on active trip', async () => {
      repo.findTripForEta.mockResolvedValue(mockTrip as any);
      repo.findTripStopsForEta.mockResolvedValue(mockStops as any);

      const res = await service.getTripEta('trip-1111');

      expect(res.tripId).toBe('trip-1111');
      expect(res.tripNumber).toBe('TRIP-101');
      expect(res.routeCode).toBe('R10');
      expect(res.stopsEta).toHaveLength(3);

      // First stop is departed
      expect(res.stopsEta[0].status).toBe('DEPARTED');
      expect(res.stopsEta[0].remainingDistanceKm).toBe(0);

      // Second stop is pending
      expect(res.stopsEta[1].status).toBe('PENDING');
      expect(res.stopsEta[1].remainingDistanceKm).toBeGreaterThan(0);
      expect(res.stopsEta[1].estimatedArrivalAt).toBeInstanceOf(Date);
      expect(['ON_TIME', 'DELAYED', 'EARLY']).toContain(res.stopsEta[1].statusIndicator);

      // Third stop is further along
      expect(res.stopsEta[2].sequenceNumber).toBe(3);
      expect(res.stopsEta[2].remainingDistanceKm).toBeGreaterThan(
        res.stopsEta[1].remainingDistanceKm,
      );
    });

    it('should fall back safely when trip has no vehicle coordinates', async () => {
      const tripWithoutCoords = {
        ...mockTrip,
        vehicle_lat: null,
        vehicle_lon: null,
        trip_lat: null,
        trip_lon: null,
      };
      repo.findTripForEta.mockResolvedValue(tripWithoutCoords as any);
      repo.findTripStopsForEta.mockResolvedValue(mockStops as any);

      const res = await service.getTripEta('trip-1111');
      expect(res.tripId).toBe('trip-1111');
      expect(res.stopsEta).toHaveLength(3);
    });
  });

  describe('getStopEta', () => {
    it('should return empty list when no approaching trips', async () => {
      repo.findApproachingTripsForStop.mockResolvedValue([]);

      const res = await service.getStopEta('stop-999');
      expect(res).toEqual([]);
      expect(repo.findApproachingTripsForStop).toHaveBeenCalledWith('stop-999');
    });

    it('should return sorted predictions for approaching trips', async () => {
      const mockApproaching = [
        {
          trip_id: 'trip-1',
          trip_number: 'TRIP-101',
          route_code: 'R10',
          route_name: 'Downtown Loop',
          vehicle_code: 'BUS-001',
          sequence_number: 4,
          scheduled_arrival_at: new Date(Date.now() + 1000 * 60 * 20),
          trip_status: 'IN_TRANSIT',
          current_latitude: 40.715,
          current_longitude: -74.008,
          stop_latitude: 40.73,
          stop_longitude: -74.015,
        },
        {
          trip_id: 'trip-2',
          trip_number: 'TRIP-102',
          route_code: 'R10',
          route_name: 'Downtown Loop',
          vehicle_code: 'BUS-002',
          sequence_number: 2,
          scheduled_arrival_at: new Date(Date.now() + 1000 * 60 * 5),
          trip_status: 'IN_TRANSIT',
          current_latitude: 40.728,
          current_longitude: -74.014,
          stop_latitude: 40.73,
          stop_longitude: -74.015,
        },
      ];

      repo.findApproachingTripsForStop.mockResolvedValue(mockApproaching as any);

      const res = await service.getStopEta('stop-3');
      expect(res).toHaveLength(2);
      expect(res[0].tripId).toBe('trip-2'); // Closer trip should arrive earlier
      expect(res[1].tripId).toBe('trip-1');
      expect(res[0].remainingDistanceKm).toBeLessThan(res[1].remainingDistanceKm);
    });
  });
});
