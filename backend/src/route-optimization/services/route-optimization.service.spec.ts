import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { RouteOptimizationRepository } from '../repositories/route-optimization.repository';
import { RouteOptimizationService } from './route-optimization.service';

describe('RouteOptimizationService', () => {
  let service: RouteOptimizationService;
  let repo: jest.Mocked<RouteOptimizationRepository>;

  const testRouteId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';

  const mockRoute = {
    id: testRouteId,
    route_code: 'DEL-JPR-101',
    name: 'Delhi to Jaipur High Speed',
    distance_km: 260.0,
    estimated_duration_minutes: 300,
    status: 'ACTIVE',
  };

  const mockStops = [
    {
      stop_id: 's1',
      stop_code: 'DEL-01',
      stop_name: 'Delhi Kashmiri Gate',
      sequence_number: 1,
      latitude: 28.6678,
      longitude: 77.2285,
    },
    {
      stop_id: 's2',
      stop_code: 'GGN-01',
      stop_name: 'Gurugram IFFCO Chowk',
      sequence_number: 2,
      latitude: 28.4721,
      longitude: 77.0725,
    },
    {
      stop_id: 's3',
      stop_code: 'JPR-01',
      stop_name: 'Jaipur Sindhi Camp',
      sequence_number: 3,
      latitude: 26.9239,
      longitude: 75.8016,
    },
  ];

  const mockHourly = [
    {
      hour_of_day: 10,
      trips_count: 20,
      avg_delay_minutes: 2.5,
      max_delay_minutes: 6,
      on_time_percentage: 95.0,
    },
    {
      hour_of_day: 18,
      trips_count: 25,
      avg_delay_minutes: 18.2,
      max_delay_minutes: 45,
      on_time_percentage: 45.0,
    },
  ];

  beforeEach(async () => {
    const mockRepo = {
      findRouteById: jest.fn(),
      findRouteStops: jest.fn(),
      getRouteHourlyDelay: jest.fn(),
      getNetworkCongestionHotspots: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RouteOptimizationService,
        { provide: RouteOptimizationRepository, useValue: mockRepo },
      ],
    }).compile();

    service = module.get<RouteOptimizationService>(RouteOptimizationService);
    repo = module.get(RouteOptimizationRepository);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getRouteAnalytics', () => {
    it('should throw NotFoundException if route not found', async () => {
      repo.findRouteById.mockResolvedValueOnce(null);

      await expect(service.getRouteAnalytics(testRouteId)).rejects.toThrow(NotFoundException);
    });

    it('should compute segment-level analytics and efficiency score', async () => {
      repo.findRouteById.mockResolvedValueOnce(mockRoute);
      repo.findRouteStops.mockResolvedValueOnce(mockStops);

      const result = await service.getRouteAnalytics(testRouteId);
      expect(result.routeId).toBe(testRouteId);
      expect(result.totalSegments).toBe(2);
      expect(result.segments[0].fromStopName).toBe('Delhi Kashmiri Gate');
      expect(result.segments[0].toStopName).toBe('Gurugram IFFCO Chowk');
      expect(result.efficiencyScore).toBeGreaterThanOrEqual(40);
      expect(result.networkRating).toBeDefined();
    });
  });

  describe('getRouteRecommendations', () => {
    it('should throw NotFoundException if route not found', async () => {
      repo.findRouteById.mockResolvedValueOnce(null);

      await expect(service.getRouteRecommendations(testRouteId)).rejects.toThrow(NotFoundException);
    });

    it('should return optimal departure windows and congestion warnings', async () => {
      repo.findRouteById.mockResolvedValueOnce(mockRoute);
      repo.getRouteHourlyDelay.mockResolvedValueOnce(mockHourly);

      const result = await service.getRouteRecommendations(testRouteId, 30);
      expect(result.routeId).toBe(testRouteId);
      expect(result.bestDepartureWindows).toHaveLength(2);
      expect(result.bestDepartureWindows[0].hourWindow).toBe('10:00 - 11:00');
      expect(result.peakCongestionWindows[0].hourWindow).toBe('18:00 - 19:00');
      expect(result.advisoryNote).toContain('10:00 - 11:00');
    });
  });

  describe('getNetworkCongestionHotspots', () => {
    it('should query and return top network bottlenecks', async () => {
      const mockHotspots = [
        {
          route_id: testRouteId,
          route_code: 'DEL-JPR-101',
          from_stop_id: 's1',
          from_stop_name: 'Delhi Kashmiri Gate',
          to_stop_id: 's2',
          to_stop_name: 'Gurugram IFFCO Chowk',
          sample_size: 45,
          avg_delay_minutes: 16.5,
          congestion_level: 'CRITICAL' as const,
        },
      ];
      repo.getNetworkCongestionHotspots.mockResolvedValueOnce(mockHotspots);

      const result = await service.getNetworkCongestionHotspots(10);
      expect(result).toHaveLength(1);
      expect(result[0].congestion_level).toBe('CRITICAL');
    });
  });
});
