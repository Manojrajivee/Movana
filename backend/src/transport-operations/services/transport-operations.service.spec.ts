import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../../database/database.service';
import { DriversRepository } from '../../drivers/repositories/drivers.repository';
import { FleetRepository } from '../../fleet/repositories/fleet.repository';
import { TransportOperationsRepository } from '../repositories/transport-operations.repository';
import { TransportOperationsService } from './transport-operations.service';

describe('TransportOperationsService', () => {
  let service: TransportOperationsService;
  let repo: jest.Mocked<TransportOperationsRepository>;
  let fleetRepo: jest.Mocked<FleetRepository>;
  let driversRepo: jest.Mocked<DriversRepository>;

  const mockTrip: any = {
    id: '11111111-1111-4111-a111-111111111111',
    trip_number: 'TRIP-KA-2026-001',
    route_id: '22222222-2222-4222-a222-222222222222',
    vehicle_id: '33333333-3333-4333-a333-333333333333',
    primary_driver_id: '44444444-4444-4444-a444-444444444444',
    secondary_driver_id: null,
    scheduled_departure_at: new Date('2026-11-01T08:00:00Z'),
    scheduled_arrival_at: new Date('2026-11-01T10:30:00Z'),
    actual_departure_at: null,
    actual_arrival_at: null,
    status: 'SCHEDULED',
    delay_minutes: 0,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const mockRoute = {
    id: '22222222-2222-4222-a222-222222222222',
    route_code: 'RT-101',
    name: 'Majestic to Electronic City',
    status: 'ACTIVE',
  };

  const mockVehicle: any = {
    id: '33333333-3333-4333-a333-333333333333',
    registration_number: 'KA-01-EQ-9999',
    status: 'ACTIVE',
  };

  const mockDriver: any = {
    id: '44444444-4444-4444-a444-444444444444',
    userId: 'user-driver-uuid',
    employeeCode: 'DRV-100',
    employmentStatus: 'ACTIVE',
  };

  const mockOperatorUser = {
    id: 'operator-user-id',
    email: 'op@movana.internal',
    roles: ['OPERATOR'],
    permissions: [],
  };

  const mockDriverUser = {
    id: 'user-driver-uuid',
    email: 'drv@movana.internal',
    roles: ['DRIVER'],
    permissions: [],
  };

  beforeEach(async () => {
    const mockDbService = {
      withTransaction: jest.fn().mockImplementation(async (cb) => cb({})),
      query: jest.fn().mockResolvedValue({ rows: [] }),
    };

    const mockRepo = {
      createTrip: jest.fn().mockResolvedValue(mockTrip),
      findTripById: jest.fn().mockResolvedValue(mockTrip),
      findTripByNumber: jest.fn().mockResolvedValue(null),
      findRouteById: jest.fn().mockResolvedValue(mockRoute),
      findTrips: jest.fn().mockResolvedValue({ trips: [mockTrip], total: 1 }),
      updateTripStatus: jest.fn().mockResolvedValue({ ...mockTrip, status: 'BOARDING' }),
      updateTripCrew: jest.fn().mockResolvedValue(mockTrip),
      recordStatusHistory: jest.fn().mockResolvedValue({}),
      findStatusHistoryByTripId: jest.fn().mockResolvedValue([]),
      createTripAssignment: jest.fn().mockResolvedValue({ id: 'assign-uuid' }),
      findTripAssignments: jest.fn().mockResolvedValue([]),
      createTripEvent: jest.fn().mockResolvedValue({ id: 'event-uuid' }),
      findTripEvents: jest.fn().mockResolvedValue([]),
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

    const mockFleet = {
      findVehicleById: jest.fn().mockResolvedValue(mockVehicle),
    };

    const mockDrivers = {
      findById: jest.fn().mockResolvedValue(mockDriver),
      findByUserId: jest.fn().mockResolvedValue(mockDriver),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransportOperationsService,
        { provide: TransportOperationsRepository, useValue: mockRepo },
        { provide: FleetRepository, useValue: mockFleet },
        { provide: DriversRepository, useValue: mockDrivers },
        { provide: DatabaseService, useValue: mockDbService },
      ],
    }).compile();

    service = module.get<TransportOperationsService>(TransportOperationsService);
    repo = module.get(TransportOperationsRepository);
    fleetRepo = module.get(FleetRepository);
    driversRepo = module.get(DriversRepository);
  });

  describe('createTrip', () => {
    it('should create trip successfully with valid inputs', async () => {
      const result = await service.createTrip(
        {
          tripNumber: 'TRIP-KA-2026-001',
          routeId: '22222222-2222-4222-a222-222222222222',
          vehicleId: '33333333-3333-4333-a333-333333333333',
          primaryDriverId: '44444444-4444-4444-a444-444444444444',
          scheduledDepartureAt: '2026-11-01T08:00:00Z',
          scheduledArrivalAt: '2026-11-01T10:30:00Z',
        },
        mockOperatorUser,
      );

      expect(result).toBeDefined();
      expect(repo.createTrip).toHaveBeenCalled();
      expect(repo.recordStatusHistory).toHaveBeenCalled();
      expect(repo.createTripAssignment).toHaveBeenCalled();
    });

    it('should reject trip when arrival is before departure', async () => {
      await expect(
        service.createTrip(
          {
            tripNumber: 'TRIP-ERR',
            routeId: '22222222-2222-4222-a222-222222222222',
            scheduledDepartureAt: '2026-11-01T12:00:00Z',
            scheduledArrivalAt: '2026-11-01T10:00:00Z',
          },
          mockOperatorUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject trip when tripNumber is already registered', async () => {
      repo.findTripByNumber.mockResolvedValueOnce(mockTrip);

      await expect(
        service.createTrip(
          {
            tripNumber: 'TRIP-KA-2026-001',
            routeId: '22222222-2222-4222-a222-222222222222',
            scheduledDepartureAt: '2026-11-01T08:00:00Z',
            scheduledArrivalAt: '2026-11-01T10:30:00Z',
          },
          mockOperatorUser,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('should reject trip when vehicle is not active', async () => {
      fleetRepo.findVehicleById.mockResolvedValueOnce({
        ...mockVehicle,
        status: 'MAINTENANCE',
      });

      await expect(
        service.createTrip(
          {
            tripNumber: 'TRIP-NEW',
            routeId: '22222222-2222-4222-a222-222222222222',
            vehicleId: '33333333-3333-4333-a333-333333333333',
            scheduledDepartureAt: '2026-11-01T08:00:00Z',
            scheduledArrivalAt: '2026-11-01T10:30:00Z',
          },
          mockOperatorUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject trip when primary and secondary driver are identical', async () => {
      await expect(
        service.createTrip(
          {
            tripNumber: 'TRIP-NEW-2',
            routeId: '22222222-2222-4222-a222-222222222222',
            primaryDriverId: '44444444-4444-4444-a444-444444444444',
            secondaryDriverId: '44444444-4444-4444-a444-444444444444',
            scheduledDepartureAt: '2026-11-01T08:00:00Z',
            scheduledArrivalAt: '2026-11-01T10:30:00Z',
          },
          mockOperatorUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getTripById', () => {
    it('should retrieve trip for operator', async () => {
      const trip = await service.getTripById(
        '11111111-1111-4111-a111-111111111111',
        mockOperatorUser,
      );
      expect(trip.id).toBe(mockTrip.id);
    });

    it('should throw ForbiddenException if driver attempts to view unassigned trip', async () => {
      driversRepo.findByUserId.mockResolvedValueOnce({
        ...mockDriver,
        id: 'different-driver-uuid',
      });

      await expect(
        service.getTripById('11111111-1111-4111-a111-111111111111', mockDriverUser),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('updateTripStatus', () => {
    it('should update trip status and record status history', async () => {
      const result = await service.updateTripStatus(
        '11111111-1111-4111-a111-111111111111',
        { status: 'BOARDING', reason: 'Gate opened' },
        mockOperatorUser,
      );

      expect(result).toBeDefined();
      expect(repo.updateTripStatus).toHaveBeenCalled();
      expect(repo.recordStatusHistory).toHaveBeenCalled();
      expect(repo.createTripEvent).toHaveBeenCalled();
    });

    it('should reject status change from terminal COMPLETED state', async () => {
      repo.findTripById.mockResolvedValueOnce({
        ...mockTrip,
        status: 'COMPLETED',
      });

      await expect(
        service.updateTripStatus(
          '11111111-1111-4111-a111-111111111111',
          { status: 'IN_TRANSIT' },
          mockOperatorUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('recordTripEvent', () => {
    it('should record event for assigned driver', async () => {
      const event = await service.recordTripEvent(
        '11111111-1111-4111-a111-111111111111',
        { eventType: 'STOP_ARRIVED', eventData: { stopSequence: 3 } },
        mockDriverUser,
      );

      expect(event).toBeDefined();
      expect(repo.createTripEvent).toHaveBeenCalled();
    });
  });

  describe('assignCrew', () => {
    it('should assign driver and vehicle to trip', async () => {
      const assignment = await service.assignCrew(
        '11111111-1111-4111-a111-111111111111',
        {
          driverId: '44444444-4444-4444-a444-444444444444',
          vehicleId: '33333333-3333-4333-a333-333333333333',
          assignmentType: 'PRIMARY_DRIVER',
        },
        mockOperatorUser,
      );

      expect(assignment).toBeDefined();
      expect(repo.createTripAssignment).toHaveBeenCalled();
      expect(repo.updateTripCrew).toHaveBeenCalled();
    });
  });

  describe('getDispatchSummary', () => {
    it('should return aggregated dispatch overview metrics', async () => {
      const summary = await service.getDispatchSummary(mockOperatorUser);

      expect(summary.totalTrips).toBe(10);
      expect(summary.inTransitTrips).toBe(3);
    });
  });
});
