import { Test, TestingModule } from '@nestjs/testing';
import { TripsController } from './trips.controller';
import { TripsService } from '../services/trips.service';

describe('TripsController', () => {
  let controller: TripsController;
  let service: jest.Mocked<TripsService>;

  const mockUser: any = {
    id: '11111111-1111-4111-a111-111111111111',
    email: 'admin@movana.internal',
    roles: ['ADMIN'],
    permissions: [],
  };

  const tripId = '22222222-2222-4222-a222-222222222222';
  const scheduleId = '33333333-3333-4333-a333-333333333333';
  const routeId = '44444444-4444-4444-a444-444444444444';

  beforeEach(async () => {
    const mockService: Partial<jest.Mocked<TripsService>> = {
      dispatchSchedule: jest.fn(),
      createAdHocTrip: jest.fn(),
      getTrips: jest.fn(),
      getTripById: jest.fn(),
      getTripStops: jest.fn(),
      updateTrip: jest.fn(),
      cancelTrip: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TripsController],
      providers: [
        {
          provide: TripsService,
          useValue: mockService,
        },
      ],
    }).compile();

    controller = module.get<TripsController>(TripsController);
    service = module.get(TripsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should delegate dispatchSchedule to service', async () => {
    const payload = {
      scheduleId,
      serviceDate: '2026-10-28',
      tripNumber: 'TRIP-101',
    };
    service.dispatchSchedule.mockResolvedValue({
      trip: { id: tripId, trip_number: 'TRIP-101' } as any,
      stops: [],
    });

    const res = await controller.dispatchSchedule(payload, mockUser);
    expect(res.trip.id).toBe(tripId);
    expect(service.dispatchSchedule).toHaveBeenCalledWith(
      expect.objectContaining({ scheduleId, serviceDate: '2026-10-28' }),
      mockUser.id,
    );
  });

  it('should delegate createAdHocTrip to service', async () => {
    const payload = {
      routeId,
      scheduledDepartureAt: '2026-10-28T08:00:00.000Z',
      scheduledArrivalAt: '2026-10-28T10:00:00.000Z',
      tripNumber: 'ADHOC-101',
    };
    service.createAdHocTrip.mockResolvedValue({
      trip: { id: tripId, trip_number: 'ADHOC-101' } as any,
      stops: [],
    });

    const res = await controller.createAdHocTrip(payload, mockUser);
    expect(res.trip.id).toBe(tripId);
    expect(service.createAdHocTrip).toHaveBeenCalledWith(
      expect.objectContaining({ routeId, tripNumber: 'ADHOC-101' }),
      mockUser.id,
    );
  });

  it('should delegate getTrips to service', async () => {
    service.getTrips.mockResolvedValue({
      data: [{ id: tripId } as any],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    });

    const res = await controller.getTrips({ page: '1', limit: '20' });
    expect(res.data).toHaveLength(1);
    expect(service.getTrips).toHaveBeenCalled();
  });

  it('should delegate getTripById to service', async () => {
    service.getTripById.mockResolvedValue({
      trip: { id: tripId } as any,
      stops: [],
    });

    const res = await controller.getTripById(tripId);
    expect(res.trip.id).toBe(tripId);
    expect(service.getTripById).toHaveBeenCalledWith(tripId);
  });

  it('should delegate getTripStops to service', async () => {
    service.getTripStops.mockResolvedValue([{ id: 'stop-1' } as any]);

    const res = await controller.getTripStops(tripId);
    expect(res).toHaveLength(1);
    expect(service.getTripStops).toHaveBeenCalledWith(tripId);
  });

  it('should delegate updateTrip to service', async () => {
    service.updateTrip.mockResolvedValue({ id: tripId } as any);

    const res = await controller.updateTrip(tripId, {});
    expect(res.id).toBe(tripId);
    expect(service.updateTrip).toHaveBeenCalledWith(tripId, {});
  });

  it('should delegate cancelTrip to service', async () => {
    service.cancelTrip.mockResolvedValue({ id: tripId, status: 'CANCELLED' } as any);

    const res = await controller.cancelTrip(tripId, { reason: 'Road emergency' }, mockUser);
    expect(res.status).toBe('CANCELLED');
    expect(service.cancelTrip).toHaveBeenCalledWith(
      tripId,
      { reason: 'Road emergency' },
      mockUser.id,
    );
  });
});
