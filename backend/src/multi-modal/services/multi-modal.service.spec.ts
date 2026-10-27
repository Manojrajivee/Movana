import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MultiModalRepository } from '../repositories/multi-modal.repository';
import { MultiModalService } from './multi-modal.service';

describe('MultiModalService', () => {
  let service: MultiModalService;
  let repo: jest.Mocked<MultiModalRepository>;

  const originStopId = '11111111-1111-4111-a111-111111111111';
  const destStopId = '22222222-2222-4222-a222-222222222222';
  const hubStopId = '33333333-3333-4333-a333-333333333333';

  const mockOriginStop = {
    id: originStopId,
    stop_code: 'ISBT-01',
    name: 'Kashmere Gate ISBT',
    city: 'Delhi',
    latitude: 28.6678,
    longitude: 77.2285,
  };

  const mockDestStop = {
    id: destStopId,
    stop_code: 'CP-01',
    name: 'Connaught Place',
    city: 'Delhi',
    latitude: 28.6315,
    longitude: 77.2167,
  };

  const mockHubStop = {
    id: hubStopId,
    stop_code: 'NDLS-01',
    name: 'New Delhi Railway Station Hub',
    city: 'Delhi',
    latitude: 28.6431,
    longitude: 77.2223,
  };

  beforeEach(async () => {
    const mockRepo = {
      findStopById: jest.fn(),
      findInterchangeHubs: jest.fn(),
      findHubConnections: jest.fn(),
      findDirectRouteOption: jest.fn(),
      findConnectingHub: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [MultiModalService, { provide: MultiModalRepository, useValue: mockRepo }],
    }).compile();

    service = module.get<MultiModalService>(MultiModalService);
    repo = module.get(MultiModalRepository);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getSupportedModes', () => {
    it('should return list of transit mode definitions', () => {
      const modes = service.getSupportedModes();
      expect(modes.length).toBeGreaterThanOrEqual(4);
      expect(modes.some((m) => m.mode === 'BUS_RAPID_TRANSIT')).toBe(true);
      expect(modes.some((m) => m.mode === 'WALKING_CONNECTION')).toBe(true);
    });
  });

  describe('getInterchangeHubs', () => {
    it('should return interchange hubs from repo', async () => {
      repo.findInterchangeHubs.mockResolvedValueOnce([
        {
          hub_stop_id: hubStopId,
          hub_stop_code: 'NDLS-01',
          hub_stop_name: 'New Delhi Railway Station Hub',
          city: 'Delhi',
          latitude: 28.6431,
          longitude: 77.2223,
          connected_routes_count: 5,
          connected_routes: ['101', '202', '303'],
        },
      ]);

      const result = await service.getInterchangeHubs(10);
      expect(result).toHaveLength(1);
      expect(result[0].connected_routes_count).toBe(5);
    });
  });

  describe('getHubConnections', () => {
    it('should throw NotFoundException if hub stop does not exist', async () => {
      repo.findStopById.mockResolvedValueOnce(null);

      await expect(service.getHubConnections(hubStopId)).rejects.toThrow(NotFoundException);
    });

    it('should return hub details and connected route lines', async () => {
      repo.findStopById.mockResolvedValueOnce(mockHubStop);
      repo.findHubConnections.mockResolvedValueOnce([
        {
          route_id: 'r1',
          route_code: '101',
          route_name: 'Airport Express',
          sequence_number: 1,
          origin_stop_name: 'New Delhi Railway Station Hub',
          destination_stop_name: 'IGI Airport T3',
          vehicle_type_name: 'Electric AC Express',
        },
      ]);

      const result = await service.getHubConnections(hubStopId);
      expect(result.hub.name).toBe(mockHubStop.name);
      expect(result.connectionsCount).toBe(1);
      expect(result.routes[0].route_code).toBe('101');
    });
  });

  describe('planMultiModalJourney', () => {
    it('should throw NotFoundException if origin not found', async () => {
      repo.findStopById.mockResolvedValueOnce(null);

      await expect(
        service.planMultiModalJourney({
          originStopId,
          destinationStopId: destStopId,
          maxWalkingMeters: 800,
          preferDirect: false,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if origin and destination are the same', async () => {
      repo.findStopById.mockResolvedValueOnce(mockOriginStop).mockResolvedValueOnce(mockOriginStop);

      await expect(
        service.planMultiModalJourney({
          originStopId,
          destinationStopId: originStopId,
          maxWalkingMeters: 800,
          preferDirect: false,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should build multi-modal itinerary with direct and intermodal legs', async () => {
      repo.findStopById.mockResolvedValueOnce(mockOriginStop).mockResolvedValueOnce(mockDestStop);

      repo.findDirectRouteOption.mockResolvedValueOnce({
        route_id: 'r1',
        route_code: '101',
        route_name: 'Direct BRT',
        orig_seq: 1,
        dest_seq: 6,
        stops_count: 5,
        distance_km: 12.5,
        duration_minutes: 30,
      });

      repo.findConnectingHub.mockResolvedValueOnce({
        hub_id: hubStopId,
        hub_name: 'Central Interchange',
        hub_code: 'C-01',
        hub_lat: 28.64,
        hub_lon: 77.22,
        leg1_route_id: 'r2',
        leg1_route_code: '202',
        leg1_route_name: 'Origin to Central',
        leg1_stops: 3,
        leg2_route_id: 'r3',
        leg2_route_code: '303',
        leg2_route_name: 'Central to Destination',
        leg2_stops: 3,
      });

      const res = await service.planMultiModalJourney({
        originStopId,
        destinationStopId: destStopId,
        maxWalkingMeters: 800,
        preferDirect: false,
      });

      expect(res.itineraries).toHaveLength(2);
      expect(res.itineraries[0].legs[0].mode).toBe('BUS_RAPID_TRANSIT');
      expect(res.itineraries[1].totalLegs).toBe(3);
      expect(res.itineraries[1].legs[1].mode).toBe('WALKING_CONNECTION');
    });
  });
});
