import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { FleetOperationsService } from './fleet-operations.service';
import { FleetOperationsRepository } from '../repositories/fleet-operations.repository';
import { FleetRepository } from '../../fleet/repositories/fleet.repository';
import { DriversRepository } from '../../drivers/repositories/drivers.repository';
import { DatabaseService } from '../../database/database.service';

describe('FleetOperationsService', () => {
  let service: FleetOperationsService;
  let fleetOpsRepo: jest.Mocked<FleetOperationsRepository>;
  let fleetRepo: jest.Mocked<FleetRepository>;
  let driversRepo: jest.Mocked<DriversRepository>;
  let db: jest.Mocked<DatabaseService>;

  const operatorUser: any = {
    id: 'user-op-1',
    roles: ['OPERATOR'],
  };

  const driverUser: any = {
    id: 'user-drv-1',
    roles: ['DRIVER'],
  };

  const mockVehicle: any = {
    id: 'veh-1',
    registration_number: 'KA-01-EQ-1001',
    vehicle_code: 'BUS-101',
    status: 'ACTIVE',
    deleted_at: null,
  };

  const mockDriver: any = {
    id: 'drv-1',
    user_id: 'user-drv-1',
    employee_code: 'EMP-101',
    license_number: 'DL-101',
    licenseExpiryDate: '2030-12-31',
    employmentStatus: 'ACTIVE',
    verificationStatus: 'VERIFIED',
  };

  const mockAssignment: any = {
    id: 'assign-1',
    vehicle_id: 'veh-1',
    driver_id: 'drv-1',
    trip_id: null,
    assignment_type: 'TRIP',
    start_at: new Date('2026-11-01T08:00:00Z'),
    end_at: new Date('2026-11-01T16:00:00Z'),
    status: 'SCHEDULED',
    assigned_by: 'user-op-1',
    created_at: new Date(),
    updated_at: new Date(),
  };

  beforeEach(async () => {
    const mockClient = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FleetOperationsService,
        {
          provide: FleetOperationsRepository,
          useValue: {
            createVehicleAssignment: jest.fn(),
            findConflictingVehicleAssignment: jest.fn(),
            findAssignmentById: jest.fn(),
            findAssignments: jest.fn(),
            updateAssignmentStatus: jest.fn(),
            findVehicleStatusHistory: jest.fn(),
            getFleetSummary: jest.fn(),
            getActiveVehicleAssignment: jest.fn(),
          },
        },
        {
          provide: FleetRepository,
          useValue: {
            findVehicleById: jest.fn(),
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
          provide: DatabaseService,
          useValue: {
            withTransaction: jest.fn().mockImplementation((cb) => cb(mockClient)),
          },
        },
      ],
    }).compile();

    service = module.get<FleetOperationsService>(FleetOperationsService);
    fleetOpsRepo = module.get(FleetOperationsRepository);
    fleetRepo = module.get(FleetRepository);
    driversRepo = module.get(DriversRepository);
    db = module.get(DatabaseService);
  });

  describe('createAssignment', () => {
    it('should successfully create an assignment with transaction mirroring', async () => {
      fleetRepo.findVehicleById.mockResolvedValue(mockVehicle);
      driversRepo.findById.mockResolvedValue(mockDriver);
      fleetOpsRepo.findConflictingVehicleAssignment.mockResolvedValue(null);
      fleetOpsRepo.createVehicleAssignment.mockResolvedValue(mockAssignment);

      const result = await service.createAssignment(
        {
          vehicleId: 'veh-1',
          driverId: 'drv-1',
          assignmentType: 'TRIP',
          startAt: '2026-11-01T08:00:00Z',
          endAt: '2026-11-01T16:00:00Z',
        },
        operatorUser,
      );

      expect(result).toEqual(mockAssignment);
      expect(fleetOpsRepo.createVehicleAssignment).toHaveBeenCalled();
      expect(db.withTransaction).toHaveBeenCalled();
    });

    it('should reject if vehicle is not found', async () => {
      fleetRepo.findVehicleById.mockResolvedValue(null);

      await expect(
        service.createAssignment(
          {
            vehicleId: 'veh-999',
            driverId: 'drv-1',
            assignmentType: 'TRIP',
            startAt: '2026-11-01T08:00:00Z',
          },
          operatorUser,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should reject if vehicle is decommissioned', async () => {
      fleetRepo.findVehicleById.mockResolvedValue({
        ...mockVehicle,
        deleted_at: new Date(),
      });

      await expect(
        service.createAssignment(
          {
            vehicleId: 'veh-1',
            driverId: 'drv-1',
            assignmentType: 'TRIP',
            startAt: '2026-11-01T08:00:00Z',
          },
          operatorUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject if vehicle is not ACTIVE', async () => {
      fleetRepo.findVehicleById.mockResolvedValue({
        ...mockVehicle,
        status: 'MAINTENANCE',
      });

      await expect(
        service.createAssignment(
          {
            vehicleId: 'veh-1',
            driverId: 'drv-1',
            assignmentType: 'TRIP',
            startAt: '2026-11-01T08:00:00Z',
          },
          operatorUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject if driver is not found', async () => {
      fleetRepo.findVehicleById.mockResolvedValue(mockVehicle);
      driversRepo.findById.mockResolvedValue(null);

      await expect(
        service.createAssignment(
          {
            vehicleId: 'veh-1',
            driverId: 'drv-999',
            assignmentType: 'TRIP',
            startAt: '2026-11-01T08:00:00Z',
          },
          operatorUser,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should reject if driver is not ACTIVE', async () => {
      fleetRepo.findVehicleById.mockResolvedValue(mockVehicle);
      driversRepo.findById.mockResolvedValue({
        ...mockDriver,
        employmentStatus: 'SUSPENDED',
      });

      await expect(
        service.createAssignment(
          {
            vehicleId: 'veh-1',
            driverId: 'drv-1',
            assignmentType: 'TRIP',
            startAt: '2026-11-01T08:00:00Z',
          },
          operatorUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject if driver compliance is not VERIFIED', async () => {
      fleetRepo.findVehicleById.mockResolvedValue(mockVehicle);
      driversRepo.findById.mockResolvedValue({
        ...mockDriver,
        verificationStatus: 'PENDING',
      });

      await expect(
        service.createAssignment(
          {
            vehicleId: 'veh-1',
            driverId: 'drv-1',
            assignmentType: 'TRIP',
            startAt: '2026-11-01T08:00:00Z',
          },
          operatorUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject if driver license has expired', async () => {
      fleetRepo.findVehicleById.mockResolvedValue(mockVehicle);
      driversRepo.findById.mockResolvedValue({
        ...mockDriver,
        licenseExpiryDate: '2020-01-01',
      });

      await expect(
        service.createAssignment(
          {
            vehicleId: 'veh-1',
            driverId: 'drv-1',
            assignmentType: 'TRIP',
            startAt: '2026-11-01T08:00:00Z',
          },
          operatorUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject if vehicle has an overlapping assignment', async () => {
      fleetRepo.findVehicleById.mockResolvedValue(mockVehicle);
      driversRepo.findById.mockResolvedValue(mockDriver);
      fleetOpsRepo.findConflictingVehicleAssignment.mockResolvedValue(mockAssignment);

      await expect(
        service.createAssignment(
          {
            vehicleId: 'veh-1',
            driverId: 'drv-1',
            assignmentType: 'TRIP',
            startAt: '2026-11-01T08:00:00Z',
          },
          operatorUser,
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('getAssignments', () => {
    it('should return assignments list for operator', async () => {
      fleetOpsRepo.findAssignments.mockResolvedValue({
        assignments: [mockAssignment],
        total: 1,
      });

      const result = await service.getAssignments({ limit: 20, offset: 0 }, operatorUser);
      expect(result.total).toBe(1);
      expect(result.assignments[0].id).toBe('assign-1');
    });

    it('should scope driver query to own profile', async () => {
      driversRepo.findByUserId.mockResolvedValue(mockDriver);
      fleetOpsRepo.findAssignments.mockResolvedValue({
        assignments: [mockAssignment],
        total: 1,
      });

      const result = await service.getAssignments({ limit: 20, offset: 0 }, driverUser);
      expect(result.total).toBe(1);
      expect(fleetOpsRepo.findAssignments).toHaveBeenCalledWith(
        expect.objectContaining({ driverId: 'drv-1' }),
      );
    });
  });

  describe('getAssignmentById', () => {
    it('should retrieve assignment by ID for operator', async () => {
      fleetOpsRepo.findAssignmentById.mockResolvedValue(mockAssignment);

      const result = await service.getAssignmentById('assign-1', operatorUser);
      expect(result.id).toBe('assign-1');
    });

    it('should reject driver querying someone else assignment', async () => {
      fleetOpsRepo.findAssignmentById.mockResolvedValue({
        ...mockAssignment,
        driver_id: 'drv-other',
      });
      driversRepo.findByUserId.mockResolvedValue(mockDriver);

      await expect(service.getAssignmentById('assign-1', driverUser)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('updateAssignmentStatus', () => {
    it('should allow valid transition from SCHEDULED to ACTIVE', async () => {
      fleetOpsRepo.findAssignmentById.mockResolvedValue(mockAssignment);
      fleetOpsRepo.updateAssignmentStatus.mockResolvedValue({
        ...mockAssignment,
        status: 'ACTIVE',
      });

      const result = await service.updateAssignmentStatus(
        'assign-1',
        { status: 'ACTIVE' },
        operatorUser,
      );

      expect(result.status).toBe('ACTIVE');
    });

    it('should allow valid transition from ACTIVE to COMPLETED', async () => {
      fleetOpsRepo.findAssignmentById.mockResolvedValue({
        ...mockAssignment,
        status: 'ACTIVE',
      });
      fleetOpsRepo.updateAssignmentStatus.mockResolvedValue({
        ...mockAssignment,
        status: 'COMPLETED',
      });

      const result = await service.updateAssignmentStatus(
        'assign-1',
        { status: 'COMPLETED' },
        operatorUser,
      );

      expect(result.status).toBe('COMPLETED');
    });

    it('should reject transition out of terminal state COMPLETED', async () => {
      fleetOpsRepo.findAssignmentById.mockResolvedValue({
        ...mockAssignment,
        status: 'COMPLETED',
      });

      await expect(
        service.updateAssignmentStatus('assign-1', { status: 'ACTIVE' }, operatorUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('should prevent driver from cancelling an assignment', async () => {
      fleetOpsRepo.findAssignmentById.mockResolvedValue(mockAssignment);
      driversRepo.findByUserId.mockResolvedValue(mockDriver);

      await expect(
        service.updateAssignmentStatus('assign-1', { status: 'CANCELLED' }, driverUser),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getVehicleReadiness', () => {
    it('should return READY when vehicle is active and has no active assignment', async () => {
      fleetRepo.findVehicleById.mockResolvedValue(mockVehicle);
      fleetOpsRepo.getActiveVehicleAssignment.mockResolvedValue(null);

      const readiness = await service.getVehicleReadiness('veh-1', operatorUser);
      expect(readiness.isReady).toBe(true);
      expect(readiness.reasons.length).toBe(0);
    });

    it('should return NOT READY when vehicle is currently dispatched', async () => {
      fleetRepo.findVehicleById.mockResolvedValue(mockVehicle);
      fleetOpsRepo.getActiveVehicleAssignment.mockResolvedValue({
        ...mockAssignment,
        status: 'ACTIVE',
      });

      const readiness = await service.getVehicleReadiness('veh-1', operatorUser);
      expect(readiness.isReady).toBe(false);
      expect(readiness.reasons[0]).toContain('currently dispatched');
    });
  });

  describe('getFleetSummary', () => {
    it('should return fleet summary stats', async () => {
      fleetOpsRepo.getFleetSummary.mockResolvedValue({
        total_vehicles: 50,
        active_vehicles: 40,
        maintenance_vehicles: 5,
        reserved_vehicles: 3,
        decommissioned_vehicles: 2,
        active_assignments: 25,
      });

      const stats = await service.getFleetSummary(operatorUser);
      expect(stats.total_vehicles).toBe(50);
      expect(stats.active_vehicles).toBe(40);
    });
  });
});
