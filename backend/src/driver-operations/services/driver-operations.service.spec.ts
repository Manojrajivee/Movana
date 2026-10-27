import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { DriverOperationsService } from './driver-operations.service';
import { DriverOperationsRepository } from '../repositories/driver-operations.repository';
import { DriversRepository } from '../../drivers/repositories/drivers.repository';
import { FleetRepository } from '../../fleet/repositories/fleet.repository';
import { DatabaseService } from '../../database/database.service';

describe('DriverOperationsService', () => {
  let service: DriverOperationsService;
  let driverOpsRepo: jest.Mocked<DriverOperationsRepository>;
  let driversRepo: jest.Mocked<DriversRepository>;
  let fleetRepo: jest.Mocked<FleetRepository>;

  const driverUser: any = {
    id: 'user-drv-1',
    roles: ['DRIVER'],
  };

  const otherDriverUser: any = {
    id: 'user-drv-2',
    roles: ['DRIVER'],
  };

  const operatorUser: any = {
    id: 'user-op-1',
    roles: ['OPERATOR'],
  };

  const mockDriver: any = {
    id: 'drv-1',
    user_id: 'user-drv-1',
    employee_code: 'EMP-101',
    license_number: 'DL-101',
    employmentStatus: 'ACTIVE',
    verificationStatus: 'VERIFIED',
  };

  const mockOtherDriver: any = {
    id: 'drv-2',
    user_id: 'user-drv-2',
    employee_code: 'EMP-102',
    license_number: 'DL-102',
    employmentStatus: 'ACTIVE',
    verificationStatus: 'VERIFIED',
  };

  const mockVehicle: any = {
    id: 'veh-1',
    registration_number: 'KA-01-EQ-1001',
    vehicle_code: 'BUS-101',
    status: 'ACTIVE',
  };

  const mockAssignment: any = {
    id: 'assign-1',
    driver_id: 'drv-1',
    vehicle_id: 'veh-1',
    trip_id: null,
    assignment_type: 'REGULAR_SHIFT',
    start_at: new Date(Date.now() - 4 * 3600 * 1000), // 4 hours ago
    end_at: null,
    status: 'SCHEDULED',
    assigned_by: 'user-op-1',
    created_at: new Date(),
    updated_at: new Date(),
  };

  const mockSafetyEvent: any = {
    id: 'dse-1',
    driver_id: 'drv-1',
    vehicle_id: 'veh-1',
    trip_id: null,
    event_type: 'OVERSPEED',
    severity: 'MEDIUM',
    speed_kmh: 88.5,
    latitude: 12.9716,
    longitude: 77.5946,
    event_data: { speedLimit: 70 },
    occurred_at: new Date(),
    created_at: new Date(),
  };

  beforeEach(async () => {
    const mockClient = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DriverOperationsService,
        {
          provide: DriverOperationsRepository,
          useValue: {
            findActiveDutyAssignment: jest.fn(),
            findAssignmentById: jest.fn(),
            updateDutyStatus: jest.fn(),
            findDutyHistory: jest.fn(),
            getDriverHoursSummary: jest.fn(),
            createSafetyEvent: jest.fn(),
            findSafetyEvents: jest.fn(),
          },
        },
        {
          provide: DriversRepository,
          useValue: {
            findById: jest.fn(),
            findByUserId: jest.fn(),
          },
        },
        {
          provide: FleetRepository,
          useValue: {
            findVehicleById: jest.fn(),
          },
        },
        {
          provide: DatabaseService,
          useValue: {
            withTransaction: jest.fn().mockImplementation((cb) => cb(mockClient)),
          },
        },
      ],
    }).compile();

    service = module.get<DriverOperationsService>(DriverOperationsService);
    driverOpsRepo = module.get(DriverOperationsRepository);
    driversRepo = module.get(DriversRepository);
    fleetRepo = module.get(FleetRepository);
  });

  describe('startDuty', () => {
    it('should successfully transition assignment to ACTIVE', async () => {
      driverOpsRepo.findAssignmentById.mockResolvedValue(mockAssignment);
      driversRepo.findByUserId.mockResolvedValue(mockDriver);
      driverOpsRepo.findActiveDutyAssignment.mockResolvedValue(null);
      driverOpsRepo.updateDutyStatus.mockResolvedValue({
        ...mockAssignment,
        status: 'ACTIVE',
      });

      const result = await service.startDuty({ assignmentId: 'assign-1' }, driverUser);
      expect(result.status).toBe('ACTIVE');
      expect(driverOpsRepo.updateDutyStatus).toHaveBeenCalledWith(
        'assign-1',
        'ACTIVE',
        undefined,
        expect.anything(),
      );
    });

    it('should reject if assignment is not found', async () => {
      driverOpsRepo.findAssignmentById.mockResolvedValue(null);

      await expect(service.startDuty({ assignmentId: 'assign-999' }, driverUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should reject if driver attempts to start another driver duty', async () => {
      driverOpsRepo.findAssignmentById.mockResolvedValue(mockAssignment);
      driversRepo.findByUserId.mockResolvedValue(mockOtherDriver);

      await expect(
        service.startDuty({ assignmentId: 'assign-1' }, otherDriverUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject if driver already has an active duty shift', async () => {
      driverOpsRepo.findAssignmentById.mockResolvedValue(mockAssignment);
      driversRepo.findByUserId.mockResolvedValue(mockDriver);
      driverOpsRepo.findActiveDutyAssignment.mockResolvedValue({
        ...mockAssignment,
        id: 'assign-other-active',
        status: 'ACTIVE',
      });

      await expect(service.startDuty({ assignmentId: 'assign-1' }, driverUser)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should reject if assignment is already COMPLETED', async () => {
      driverOpsRepo.findAssignmentById.mockResolvedValue({
        ...mockAssignment,
        status: 'COMPLETED',
      });
      driversRepo.findByUserId.mockResolvedValue(mockDriver);

      await expect(service.startDuty({ assignmentId: 'assign-1' }, driverUser)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('endDuty', () => {
    it('should complete duty and calculate duration without HOS violation when under 10 hours', async () => {
      const activeAssignment = {
        ...mockAssignment,
        status: 'ACTIVE' as const,
        start_at: new Date(Date.now() - 5 * 3600 * 1000), // 5 hours ago
      };
      driverOpsRepo.findAssignmentById.mockResolvedValue(activeAssignment);
      driversRepo.findByUserId.mockResolvedValue(mockDriver);
      driverOpsRepo.updateDutyStatus.mockResolvedValue({
        ...activeAssignment,
        status: 'COMPLETED',
        end_at: new Date(),
      });

      const result = await service.endDuty({ assignmentId: 'assign-1' }, driverUser);
      expect(result.assignment.status).toBe('COMPLETED');
      expect(result.durationHours).toBeGreaterThanOrEqual(4.9);
      expect(result.durationHours).toBeLessThanOrEqual(5.1);
      expect(result.hoursExceeded).toBe(false);
      expect(driverOpsRepo.createSafetyEvent).not.toHaveBeenCalled();
    });

    it('should trigger HOURS_EXCEEDED infraction when shift duration exceeds 10 hours', async () => {
      const longActiveAssignment = {
        ...mockAssignment,
        status: 'ACTIVE' as const,
        start_at: new Date(Date.now() - 11.5 * 3600 * 1000), // 11.5 hours ago
      };
      driverOpsRepo.findAssignmentById.mockResolvedValue(longActiveAssignment);
      driversRepo.findByUserId.mockResolvedValue(mockDriver);
      driverOpsRepo.updateDutyStatus.mockResolvedValue({
        ...longActiveAssignment,
        status: 'COMPLETED',
        end_at: new Date(),
      });

      const result = await service.endDuty({ assignmentId: 'assign-1' }, driverUser);
      expect(result.hoursExceeded).toBe(true);
      expect(driverOpsRepo.createSafetyEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'HOURS_EXCEEDED',
          severity: 'HIGH',
        }),
        expect.anything(),
      );
    });

    it('should reject ending a duty that is not currently ACTIVE', async () => {
      driverOpsRepo.findAssignmentById.mockResolvedValue(mockAssignment); // SCHEDULED
      driversRepo.findByUserId.mockResolvedValue(mockDriver);

      await expect(service.endDuty({ assignmentId: 'assign-1' }, driverUser)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('getCurrentDuty', () => {
    it('should return active duty for driver', async () => {
      driversRepo.findByUserId.mockResolvedValue(mockDriver);
      driverOpsRepo.findActiveDutyAssignment.mockResolvedValue({
        ...mockAssignment,
        status: 'ACTIVE',
      });

      const result = await service.getCurrentDuty(undefined, driverUser);
      expect(result?.status).toBe('ACTIVE');
      expect(driverOpsRepo.findActiveDutyAssignment).toHaveBeenCalledWith('drv-1');
    });
  });

  describe('getDutyHistory', () => {
    it('should return duty history with HOS hours summary', async () => {
      driversRepo.findByUserId.mockResolvedValue(mockDriver);
      driverOpsRepo.findDutyHistory.mockResolvedValue({
        history: [mockAssignment],
        total: 1,
      });
      driverOpsRepo.getDriverHoursSummary.mockResolvedValue({
        driver_id: 'drv-1',
        hours_last_24h: 8.5,
        hours_last_7d: 38.0,
        total_completed_shifts: 5,
      });

      const result = await service.getDutyHistory({ limit: 20, offset: 0 }, driverUser);
      expect(result.total).toBe(1);
      expect(result.summary.hours_last_24h).toBe(8.5);
    });
  });

  describe('recordSafetyEvent', () => {
    it('should record telematics safety event for driver and vehicle', async () => {
      driversRepo.findById.mockResolvedValue(mockDriver);
      fleetRepo.findVehicleById.mockResolvedValue(mockVehicle);
      driverOpsRepo.createSafetyEvent.mockResolvedValue(mockSafetyEvent);

      const result = await service.recordSafetyEvent(
        {
          driverId: 'drv-1',
          vehicleId: 'veh-1',
          eventType: 'OVERSPEED',
          severity: 'MEDIUM',
          speedKmh: 88.5,
          occurredAt: '2026-11-01T10:00:00Z',
          eventData: { speedLimit: 70 },
        },
        operatorUser,
      );

      expect(result.id).toBe('dse-1');
      expect(driverOpsRepo.createSafetyEvent).toHaveBeenCalled();
    });

    it('should reject if driver is not found', async () => {
      driversRepo.findById.mockResolvedValue(null);

      await expect(
        service.recordSafetyEvent(
          {
            driverId: 'drv-999',
            vehicleId: 'veh-1',
            eventType: 'OVERSPEED',
            severity: 'MEDIUM',
            occurredAt: '2026-11-01T10:00:00Z',
            eventData: {},
          },
          operatorUser,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getSafetyEvents', () => {
    it('should query safety events with filters', async () => {
      driverOpsRepo.findSafetyEvents.mockResolvedValue({
        events: [mockSafetyEvent],
        total: 1,
      });

      const result = await service.getSafetyEvents(
        { limit: 20, offset: 0, severity: 'MEDIUM' },
        operatorUser,
      );

      expect(result.total).toBe(1);
      expect(result.events[0].event_type).toBe('OVERSPEED');
    });
  });
});
