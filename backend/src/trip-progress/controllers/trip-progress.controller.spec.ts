import { Test, TestingModule } from '@nestjs/testing';
import { TripProgressController } from './trip-progress.controller';
import { TripProgressService } from '../services/trip-progress.service';

describe('TripProgressController', () => {
  let controller: TripProgressController;
  let service: jest.Mocked<TripProgressService>;

  const mockUser: any = {
    id: '11111111-1111-4111-a111-111111111111',
    email: 'driver@movana.internal',
    roles: ['DRIVER'],
    permissions: [],
  };

  const tripId = '22222222-2222-4222-a222-222222222222';

  beforeEach(async () => {
    const mockService: Partial<jest.Mocked<TripProgressService>> = {
      getTripProgress: jest.fn(),
      recordMilestone: jest.fn(),
      getTripMilestones: jest.fn(),
      getLiveBoard: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TripProgressController],
      providers: [
        {
          provide: TripProgressService,
          useValue: mockService,
        },
      ],
    }).compile();

    controller = module.get<TripProgressController>(TripProgressController);
    service = module.get(TripProgressService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should delegate getLiveBoard to service', async () => {
    service.getLiveBoard.mockResolvedValue([{ trip_id: tripId, progressPercentage: 45.0 } as any]);

    const res = await controller.getLiveBoard();
    expect(res).toHaveLength(1);
    expect(service.getLiveBoard).toHaveBeenCalled();
  });

  it('should delegate getTripProgress to service', async () => {
    service.getTripProgress.mockResolvedValue({
      tripId,
      progressPercentage: 50.0,
    } as any);

    const res = await controller.getTripProgress(tripId);
    expect(res.tripId).toBe(tripId);
    expect(service.getTripProgress).toHaveBeenCalledWith(tripId);
  });

  it('should delegate recordMilestone to service', async () => {
    const payload = {
      eventType: 'REST_BREAK_START',
      eventData: { location: 'Highway Plaza' },
    };
    service.recordMilestone.mockResolvedValue({
      id: 'event-1',
      event_type: 'REST_BREAK_START',
    } as any);

    const res = await controller.recordMilestone(tripId, payload, mockUser);
    expect(res.event_type).toBe('REST_BREAK_START');
    expect(service.recordMilestone).toHaveBeenCalledWith(
      tripId,
      expect.objectContaining({ eventType: 'REST_BREAK_START' }),
      mockUser.id,
    );
  });

  it('should delegate getTripMilestones to service', async () => {
    service.getTripMilestones.mockResolvedValue([
      { id: 'event-1', event_type: 'REST_BREAK_START' } as any,
    ]);

    const res = await controller.getTripMilestones(tripId, { limit: '10' });
    expect(res).toHaveLength(1);
    expect(service.getTripMilestones).toHaveBeenCalledWith(
      tripId,
      expect.objectContaining({ limit: 10 }),
    );
  });
});
