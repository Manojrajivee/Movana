import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JourneyPlannerRepository } from '../repositories/journey-planner.repository';
import { JourneyPlannerService } from './journey-planner.service';

describe('JourneyPlannerService', () => {
  let service: JourneyPlannerService;
  let repo: jest.Mocked<JourneyPlannerRepository>;

  const originStop = {
    id: '11111111-1111-4111-a111-111111111111',
    stop_code: 'ISBT-01',
    name: 'Kashmere Gate ISBT',
    city: 'Delhi',
    latitude: 28.6678,
    longitude: 77.2285,
  };

  const destStop = {
    id: '22222222-2222-4222-a222-222222222222',
    stop_code: 'CP-01',
    name: 'Connaught Place',
    city: 'Delhi',
    latitude: 28.6315,
    longitude: 77.2167,
  };

  const transferStop = {
    id: '33333333-3333-4333-a333-333333333333',
    stop_code: 'NDLS-01',
    name: 'New Delhi Railway Station',
    city: 'Delhi',
    latitude: 28.6431,
    longitude: 77.2223,
  };

  beforeEach(async () => {
    const mockRepo = {
      findStopById: jest.fn(),
      findNearestStop: jest.fn(),
      findDirectRoutes: jest.fn(),
      findTransferRoutes: jest.fn(),
      findUpcomingTripsForRoute: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [JourneyPlannerService, { provide: JourneyPlannerRepository, useValue: mockRepo }],
    }).compile();

    service = module.get<JourneyPlannerService>(JourneyPlannerService);
    repo = module.get(JourneyPlannerRepository);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('planJourney', () => {
    it('should throw NotFoundException if origin stop is not found by ID', async () => {
      repo.findStopById.mockResolvedValueOnce(null);

      await expect(
        service.planJourney({
          originStopId: originStop.id,
          destinationStopId: destStop.id,
          maxTransfers: 1,
          sortBy: 'DURATION',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if destination stop is not found', async () => {
      repo.findStopById.mockResolvedValueOnce(originStop).mockResolvedValueOnce(null);

      await expect(
        service.planJourney({
          originStopId: originStop.id,
          destinationStopId: destStop.id,
          maxTransfers: 1,
          sortBy: 'DURATION',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if origin and destination are identical', async () => {
      repo.findStopById.mockResolvedValueOnce(originStop).mockResolvedValueOnce(originStop);

      await expect(
        service.planJourney({
          originStopId: originStop.id,
          destinationStopId: originStop.id,
          maxTransfers: 1,
          sortBy: 'DURATION',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should resolve origin and destination via GPS coordinates', async () => {
      repo.findNearestStop.mockResolvedValueOnce(originStop).mockResolvedValueOnce(destStop);
      repo.findDirectRoutes.mockResolvedValueOnce([]);
      repo.findTransferRoutes.mockResolvedValueOnce([]);

      const result = await service.planJourney({
        originLatitude: 28.6678,
        originLongitude: 77.2285,
        destinationLatitude: 28.6315,
        destinationLongitude: 77.2167,
        maxTransfers: 1,
        sortBy: 'DURATION',
      });

      expect(result.origin.id).toBe(originStop.id);
      expect(result.destination.id).toBe(destStop.id);
      expect(repo.findNearestStop).toHaveBeenCalledTimes(2);
    });

    it('should return direct and transfer itineraries sorted by duration', async () => {
      repo.findStopById.mockResolvedValueOnce(originStop).mockResolvedValueOnce(destStop);

      repo.findDirectRoutes.mockResolvedValueOnce([
        {
          route_id: 'r-1',
          route_code: '101',
          route_name: 'ISBT to CP Express',
          origin_sequence: 1,
          destination_sequence: 5,
          intermediate_stops_count: 4,
          estimated_duration_minutes: 25,
          distance_km: 8.5,
        },
      ]);
      repo.findUpcomingTripsForRoute.mockResolvedValueOnce([
        { trip_id: 'trip-1', trip_number: 'TR-101', status: 'SCHEDULED' },
      ]);

      repo.findTransferRoutes.mockResolvedValueOnce([
        {
          leg1_route_id: 'r-2',
          leg1_route_code: '202',
          leg1_route_name: 'ISBT to NDLS',
          leg1_origin_seq: 1,
          leg1_dest_seq: 3,
          transfer_stop_id: transferStop.id,
          transfer_stop_name: transferStop.name,
          transfer_stop_code: transferStop.stop_code,
          transfer_latitude: transferStop.latitude,
          transfer_longitude: transferStop.longitude,
          leg2_route_id: 'r-3',
          leg2_route_code: '303',
          leg2_route_name: 'NDLS to CP',
          leg2_origin_seq: 1,
          leg2_dest_seq: 2,
        },
      ]);

      const result = await service.planJourney({
        originStopId: originStop.id,
        destinationStopId: destStop.id,
        maxTransfers: 1,
        sortBy: 'DURATION',
      });

      expect(result.itinerariesCount).toBe(2);
      expect(result.itineraries[0].transfers).toBe(0);
      expect(result.itineraries[0].totalDurationMinutes).toBe(25);
      expect(result.itineraries[0].legs[0].upcomingTrips).toHaveLength(1);

      expect(result.itineraries[1].transfers).toBe(1);
      expect(result.itineraries[1].legs).toHaveLength(2);
    });
  });

  describe('getDirectRoutes', () => {
    it('should return direct route connections', async () => {
      repo.findStopById.mockResolvedValueOnce(originStop).mockResolvedValueOnce(destStop);

      repo.findDirectRoutes.mockResolvedValueOnce([
        {
          route_id: 'r-1',
          route_code: '101',
          route_name: 'ISBT to CP Express',
          origin_sequence: 1,
          destination_sequence: 5,
          intermediate_stops_count: 4,
          estimated_duration_minutes: 25,
          distance_km: 8.5,
        },
      ]);

      const res = await service.getDirectRoutes({
        originStopId: originStop.id,
        destinationStopId: destStop.id,
        limit: 10,
      });

      expect(res.directRoutes).toHaveLength(1);
      expect(res.directRoutes[0].route_code).toBe('101');
    });
  });

  describe('getTransferRoutes', () => {
    it('should return transfer route connections', async () => {
      repo.findStopById.mockResolvedValueOnce(originStop).mockResolvedValueOnce(destStop);

      repo.findTransferRoutes.mockResolvedValueOnce([
        {
          leg1_route_id: 'r-2',
          leg1_route_code: '202',
          leg1_route_name: 'ISBT to NDLS',
          leg1_origin_seq: 1,
          leg1_dest_seq: 3,
          transfer_stop_id: transferStop.id,
          transfer_stop_name: transferStop.name,
          transfer_stop_code: transferStop.stop_code,
          transfer_latitude: transferStop.latitude,
          transfer_longitude: transferStop.longitude,
          leg2_route_id: 'r-3',
          leg2_route_code: '303',
          leg2_route_name: 'NDLS to CP',
          leg2_origin_seq: 1,
          leg2_dest_seq: 2,
        },
      ]);

      const res = await service.getTransferRoutes(originStop.id, destStop.id, 5);
      expect(res.transferRoutes).toHaveLength(1);
      expect(res.transferRoutes[0].transfer_stop_name).toBe(transferStop.name);
    });
  });
});
