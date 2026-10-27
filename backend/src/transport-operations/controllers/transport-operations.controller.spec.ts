import { Test, TestingModule } from '@nestjs/testing';
import { AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { TransportOperationsController } from './transport-operations.controller';
import { TransportOperationsService } from '../services/transport-operations.service';

describe('TransportOperationsController', () => {
  let controller: TransportOperationsController;
  let service: jest.Mocked<TransportOperationsService>;

  const mockTrip: any = {
    id: '11111111-1111-4111-a111-111111111111',
    trip_number: 'TRIP-KA-2026-001',
    route_id: '22222222-2222-4222-a222-222222222222',
    status: 'SCHEDULED',
  };

  const mockOperatorUser: AuthenticatedUser = {
    id: '11111111-1111-4111-a111-111111111111',
    email: 'operator@movana.internal',
    roles: ['OPERATOR'],
    permissions: [],
  };

  const mockDriverUser: AuthenticatedUser = {
    id: '22222222-2222-4222-a222-222222222222',
    email: 'driver@movana.internal',
    roles: ['DRIVER'],
    permissions: [],
  };

  beforeEach(async () => {
    const mockService = {
      createTrip: jest.fn().mockResolvedValue(mockTrip),
      getTripById: jest.fn().mockResolvedValue(mockTrip),
      getTrips: jest.fn().mockResolvedValue({ trips: [mockTrip], total: 1, limit: 20, offset: 0 }),
      updateTripStatus: jest.fn().mockResolvedValue({ ...mockTrip, status: 'BOARDING' }),
      recordTripEvent: jest
        .fn()
        .mockResolvedValue({ id: 'event-uuid', event_type: 'STOP_ARRIVED' }),
      getTripEvents: jest.fn().mockResolvedValue([]),
      assignCrew: jest.fn().mockResolvedValue({ id: 'assign-uuid' }),
      getTripAssignments: jest.fn().mockResolvedValue([]),
      getTripStatusHistory: jest.fn().mockResolvedValue([]),
      getDispatchSummary: jest.fn().mockResolvedValue({
        totalTrips: 10,
        scheduledTrips: 4,
        inTransitTrips: 3,
        completedTrips: 2,
        delayedTrips: 1,
        cancelledTrips: 0,
        activeVehicles: 3,
        activeDrivers: 3,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TransportOperationsController],
      providers: [{ provide: TransportOperationsService, useValue: mockService }],
    }).compile();

    controller = module.get<TransportOperationsController>(TransportOperationsController);
    service = module.get(TransportOperationsService);
  });

  it('should create a trip', async () => {
    const res = await controller.createTrip(
      {
        tripNumber: 'TRIP-KA-2026-001',
        routeId: '22222222-2222-4222-a222-222222222222',
        scheduledDepartureAt: '2026-11-01T08:00:00Z',
        scheduledArrivalAt: '2026-11-01T10:30:00Z',
      },
      mockOperatorUser,
    );

    expect(res).toBeDefined();
    expect(service.createTrip).toHaveBeenCalled();
  });

  it('should retrieve trip by id', async () => {
    const res = await controller.getTripById(
      '11111111-1111-4111-a111-111111111111',
      mockOperatorUser,
    );

    expect(res.id).toBe(mockTrip.id);
  });

  it('should query trips with filters', async () => {
    const res = await controller.getTrips({ status: 'SCHEDULED' }, mockOperatorUser);

    expect(res.trips).toHaveLength(1);
  });

  it('should update trip status', async () => {
    const res = await controller.updateTripStatus(
      '11111111-1111-4111-a111-111111111111',
      { status: 'BOARDING' },
      mockOperatorUser,
    );

    expect(res.status).toBe('BOARDING');
  });

  it('should record trip event', async () => {
    const res = await controller.recordTripEvent(
      '11111111-1111-4111-a111-111111111111',
      { eventType: 'STOP_ARRIVED' },
      mockDriverUser,
    );

    expect(res.event_type).toBe('STOP_ARRIVED');
  });

  it('should assign crew to trip', async () => {
    const res = await controller.assignCrew(
      '11111111-1111-4111-a111-111111111111',
      {
        driverId: '44444444-4444-4444-a444-444444444444',
        vehicleId: '33333333-3333-4333-a333-333333333333',
      },
      mockOperatorUser,
    );

    expect(res.id).toBe('assign-uuid');
  });

  it('should retrieve dispatch summary', async () => {
    const res = await controller.getDispatchSummary(mockOperatorUser);

    expect(res.totalTrips).toBe(10);
  });
});
