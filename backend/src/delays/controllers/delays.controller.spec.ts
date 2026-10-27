import { Test, TestingModule } from '@nestjs/testing';
import { DelaysController } from './delays.controller';
import { DelaysService } from '../services/delays.service';

describe('DelaysController', () => {
  let controller: DelaysController;
  let service: jest.Mocked<DelaysService>;

  const mockUser: any = {
    id: '11111111-1111-4111-a111-111111111111',
    email: 'operator@movana.internal',
    roles: ['OPERATOR'],
    permissions: [],
  };

  const tripId = '22222222-2222-4222-a222-222222222222';

  beforeEach(async () => {
    const mockService: Partial<jest.Mocked<DelaysService>> = {
      detectTripDelay: jest.fn(),
      getActiveDelays: jest.fn(),
      getDelaySummary: jest.fn(),
      resolveTripDelay: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DelaysController],
      providers: [
        {
          provide: DelaysService,
          useValue: mockService,
        },
      ],
    }).compile();

    controller = module.get<DelaysController>(DelaysController);
    service = module.get(DelaysService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should delegate detectTripDelay to service', async () => {
    const expected: any = {
      tripId,
      tripNumber: 'TRIP-100',
      status: 'DELAYED',
      delayMinutes: 15,
      isDelayed: true,
    };
    service.detectTripDelay.mockResolvedValue(expected);

    const body = { simulatedDelayMinutes: 15, thresholdMinutes: 5 };
    const res = await controller.detectTripDelay(tripId, body, mockUser);

    expect(res).toBe(expected);
    expect(service.detectTripDelay).toHaveBeenCalledWith(tripId, body, mockUser.id);
  });

  it('should delegate getActiveDelays to service', async () => {
    const expected: any = { items: [], total: 0, page: 1, limit: 20 };
    service.getActiveDelays.mockResolvedValue(expected);

    const res = await controller.getActiveDelays({ page: 1, limit: 20 });
    expect(res).toBe(expected);
    expect(service.getActiveDelays).toHaveBeenCalledWith({
      page: 1,
      limit: 20,
    });
  });

  it('should delegate getDelaySummary to service', async () => {
    const expected: any = {
      totalActiveTrips: 10,
      delayedTripsCount: 2,
      onTimeTripsCount: 8,
      onTimePerformanceRate: 80,
    };
    service.getDelaySummary.mockResolvedValue(expected);

    const res = await controller.getDelaySummary();
    expect(res).toBe(expected);
    expect(service.getDelaySummary).toHaveBeenCalled();
  });

  it('should delegate resolveTripDelay to service', async () => {
    const expected: any = {
      tripId,
      newStatus: 'IN_TRANSIT',
      resolvedDelayMinutes: 0,
    };
    service.resolveTripDelay.mockResolvedValue(expected);

    const body = { resolutionNotes: 'Schedule recovered', delayMinutes: 0 };
    const res = await controller.resolveTripDelay(tripId, body, mockUser);

    expect(res).toBe(expected);
    expect(service.resolveTripDelay).toHaveBeenCalledWith(
      tripId,
      expect.objectContaining({ resolutionNotes: 'Schedule recovered' }),
      mockUser.id,
    );
  });
});
