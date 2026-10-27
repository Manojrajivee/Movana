import { Test, TestingModule } from '@nestjs/testing';
import { StopArrivalsController } from './stop-arrivals.controller';
import { StopArrivalsService } from '../services/stop-arrivals.service';

describe('StopArrivalsController', () => {
  let controller: StopArrivalsController;
  let service: jest.Mocked<StopArrivalsService>;

  const mockUser: any = {
    id: '11111111-1111-4111-a111-111111111111',
    email: 'driver@movana.internal',
    roles: ['DRIVER'],
    permissions: [],
  };

  const tripId = '22222222-2222-4222-a222-222222222222';
  const stopId = '33333333-3333-4333-a333-333333333333';

  beforeEach(async () => {
    const mockService: Partial<jest.Mocked<StopArrivalsService>> = {
      recordArrival: jest.fn(),
      recordDeparture: jest.fn(),
      recordSkip: jest.fn(),
      getTripTimeline: jest.fn(),
      getRecentStopArrivals: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StopArrivalsController],
      providers: [
        {
          provide: StopArrivalsService,
          useValue: mockService,
        },
      ],
    }).compile();

    controller = module.get<StopArrivalsController>(StopArrivalsController);
    service = module.get(StopArrivalsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should delegate recordArrival to service', async () => {
    const payload = { arrivedAt: '2026-10-28T08:00:00Z', notes: 'Dock 1' };
    service.recordArrival.mockResolvedValue({ id: 'ts-1', status: 'ARRIVED' } as any);

    const res = await controller.recordArrival(tripId, stopId, payload, mockUser);
    expect(res.status).toBe('ARRIVED');
    expect(service.recordArrival).toHaveBeenCalledWith(
      tripId,
      stopId,
      expect.objectContaining({ notes: 'Dock 1' }),
      mockUser.id,
    );
  });

  it('should delegate recordDeparture to service', async () => {
    const payload = { departedAt: '2026-10-28T08:05:00Z' };
    service.recordDeparture.mockResolvedValue({ id: 'ts-1', status: 'DEPARTED' } as any);

    const res = await controller.recordDeparture(tripId, stopId, payload, mockUser);
    expect(res.status).toBe('DEPARTED');
    expect(service.recordDeparture).toHaveBeenCalledWith(
      tripId,
      stopId,
      expect.objectContaining({ departedAt: '2026-10-28T08:05:00Z' }),
      mockUser.id,
    );
  });

  it('should delegate recordSkip to service', async () => {
    const payload = { reason: 'Roadblock detour' };
    service.recordSkip.mockResolvedValue({ id: 'ts-1', status: 'SKIPPED' } as any);

    const res = await controller.recordSkip(tripId, stopId, payload, mockUser);
    expect(res.status).toBe('SKIPPED');
    expect(service.recordSkip).toHaveBeenCalledWith(
      tripId,
      stopId,
      expect.objectContaining({ reason: 'Roadblock detour' }),
      mockUser.id,
    );
  });

  it('should delegate getTripTimeline to service', async () => {
    service.getTripTimeline.mockResolvedValue({
      tripId,
      summary: { totalStops: 5 },
      stops: [],
    } as any);

    const res = await controller.getTripTimeline(tripId);
    expect(res.tripId).toBe(tripId);
    expect(service.getTripTimeline).toHaveBeenCalledWith(tripId);
  });

  it('should delegate getRecentStopArrivals to service', async () => {
    service.getRecentStopArrivals.mockResolvedValue([{ trip_stop_id: 'ts-1' } as any]);

    const res = await controller.getRecentStopArrivals(stopId, { hours: '4', limit: '20' });
    expect(res).toHaveLength(1);
    expect(service.getRecentStopArrivals).toHaveBeenCalledWith(
      stopId,
      expect.objectContaining({ hours: 4, limit: 20 }),
    );
  });
});
