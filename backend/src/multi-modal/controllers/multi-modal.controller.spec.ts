import { Test, TestingModule } from '@nestjs/testing';
import { MultiModalController } from './multi-modal.controller';
import { MultiModalService } from '../services/multi-modal.service';

describe('MultiModalController', () => {
  let controller: MultiModalController;
  let service: jest.Mocked<MultiModalService>;

  const originStopId = '11111111-1111-4111-a111-111111111111';
  const destStopId = '22222222-2222-4222-a222-222222222222';
  const hubStopId = '33333333-3333-4333-a333-333333333333';

  beforeEach(async () => {
    const mockService = {
      getSupportedModes: jest.fn(),
      getInterchangeHubs: jest.fn(),
      getHubConnections: jest.fn(),
      planMultiModalJourney: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MultiModalController],
      providers: [{ provide: MultiModalService, useValue: mockService }],
    }).compile();

    controller = module.get<MultiModalController>(MultiModalController);
    service = module.get(MultiModalService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getSupportedModes', () => {
    it('should delegate to service.getSupportedModes', () => {
      service.getSupportedModes.mockReturnValueOnce([]);
      const result = controller.getSupportedModes();
      expect(result).toEqual([]);
      expect(service.getSupportedModes).toHaveBeenCalled();
    });
  });

  describe('getInterchangeHubs', () => {
    it('should delegate to service.getInterchangeHubs', async () => {
      service.getInterchangeHubs.mockResolvedValueOnce([]);
      const result = await controller.getInterchangeHubs('15');
      expect(result).toEqual([]);
      expect(service.getInterchangeHubs).toHaveBeenCalledWith(15);
    });
  });

  describe('getHubConnections', () => {
    it('should delegate to service.getHubConnections', async () => {
      service.getHubConnections.mockResolvedValueOnce({} as any);
      const result = await controller.getHubConnections(hubStopId);
      expect(result).toBeDefined();
      expect(service.getHubConnections).toHaveBeenCalledWith(hubStopId);
    });
  });

  describe('planMultiModalJourney', () => {
    it('should parse body and delegate to service.planMultiModalJourney', async () => {
      service.planMultiModalJourney.mockResolvedValueOnce({
        origin: {} as any,
        destination: {} as any,
        itineraries: [],
      });

      const body = {
        originStopId,
        destinationStopId: destStopId,
      };

      const result = await controller.planMultiModalJourney(body);
      expect(result.itineraries).toEqual([]);
      expect(service.planMultiModalJourney).toHaveBeenCalledWith(
        expect.objectContaining({
          originStopId,
          destinationStopId: destStopId,
        }),
      );
    });
  });
});
