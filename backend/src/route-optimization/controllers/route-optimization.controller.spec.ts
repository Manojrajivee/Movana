import { Test, TestingModule } from '@nestjs/testing';
import { RouteOptimizationController } from './route-optimization.controller';
import { RouteOptimizationService } from '../services/route-optimization.service';

describe('RouteOptimizationController', () => {
  let controller: RouteOptimizationController;
  let service: jest.Mocked<RouteOptimizationService>;

  const testRouteId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';

  beforeEach(async () => {
    const mockService = {
      getRouteAnalytics: jest.fn(),
      getRouteRecommendations: jest.fn(),
      getNetworkCongestionHotspots: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RouteOptimizationController],
      providers: [{ provide: RouteOptimizationService, useValue: mockService }],
    }).compile();

    controller = module.get<RouteOptimizationController>(RouteOptimizationController);
    service = module.get(RouteOptimizationService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getRouteAnalytics', () => {
    it('should invoke service.getRouteAnalytics with routeId and timeframeDays', async () => {
      service.getRouteAnalytics.mockResolvedValueOnce({
        routeId: testRouteId,
      } as any);

      const res = await controller.getRouteAnalytics(testRouteId, '15');
      expect(res).toEqual({ routeId: testRouteId });
      expect(service.getRouteAnalytics).toHaveBeenCalledWith(testRouteId, 15);
    });
  });

  describe('getRouteRecommendations', () => {
    it('should invoke service.getRouteRecommendations', async () => {
      service.getRouteRecommendations.mockResolvedValueOnce({
        routeId: testRouteId,
      } as any);

      const res = await controller.getRouteRecommendations(testRouteId, '30');
      expect(res).toEqual({ routeId: testRouteId });
      expect(service.getRouteRecommendations).toHaveBeenCalledWith(testRouteId, 30);
    });
  });

  describe('getNetworkCongestionHotspots', () => {
    it('should invoke service.getNetworkCongestionHotspots with parsed limit', async () => {
      service.getNetworkCongestionHotspots.mockResolvedValueOnce([]);

      const res = await controller.getNetworkCongestionHotspots('20');
      expect(res).toEqual([]);
      expect(service.getNetworkCongestionHotspots).toHaveBeenCalledWith(20);
    });
  });
});
