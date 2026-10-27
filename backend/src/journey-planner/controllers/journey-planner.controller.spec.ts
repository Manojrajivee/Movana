import { Test, TestingModule } from '@nestjs/testing';
import { JourneyPlannerController } from './journey-planner.controller';
import { JourneyPlannerService } from '../services/journey-planner.service';

describe('JourneyPlannerController', () => {
  let controller: JourneyPlannerController;
  let service: jest.Mocked<JourneyPlannerService>;

  const originStopId = '11111111-1111-4111-a111-111111111111';
  const destStopId = '22222222-2222-4222-a222-222222222222';

  beforeEach(async () => {
    const mockService = {
      planJourney: jest.fn(),
      getDirectRoutes: jest.fn(),
      getTransferRoutes: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [JourneyPlannerController],
      providers: [{ provide: JourneyPlannerService, useValue: mockService }],
    }).compile();

    controller = module.get<JourneyPlannerController>(JourneyPlannerController);
    service = module.get(JourneyPlannerService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('planJourney', () => {
    it('should invoke service.planJourney with validated payload', async () => {
      service.planJourney.mockResolvedValueOnce({
        origin: { id: originStopId } as any,
        destination: { id: destStopId } as any,
        itinerariesCount: 1,
        itineraries: [],
      });

      const body = {
        originStopId,
        destinationStopId: destStopId,
        maxTransfers: 1,
      };

      const result = await controller.planJourney(body);
      expect(result.itinerariesCount).toBe(1);
      expect(service.planJourney).toHaveBeenCalledWith(
        expect.objectContaining({
          originStopId,
          destinationStopId: destStopId,
          maxTransfers: 1,
        }),
      );
    });
  });

  describe('getDirectRoutes', () => {
    it('should invoke service.getDirectRoutes', async () => {
      service.getDirectRoutes.mockResolvedValueOnce({
        origin: { id: originStopId } as any,
        destination: { id: destStopId } as any,
        directRoutes: [],
      });

      const result = await controller.getDirectRoutes(originStopId, destStopId, '10');
      expect(result.directRoutes).toEqual([]);
      expect(service.getDirectRoutes).toHaveBeenCalledWith({
        originStopId,
        destinationStopId: destStopId,
        limit: 10,
      });
    });
  });

  describe('getTransferRoutes', () => {
    it('should invoke service.getTransferRoutes', async () => {
      service.getTransferRoutes.mockResolvedValueOnce({
        origin: { id: originStopId } as any,
        destination: { id: destStopId } as any,
        transferRoutes: [],
      });

      const result = await controller.getTransferRoutes(originStopId, destStopId, '5');
      expect(result.transferRoutes).toEqual([]);
      expect(service.getTransferRoutes).toHaveBeenCalledWith(originStopId, destStopId, 5);
    });
  });
});
