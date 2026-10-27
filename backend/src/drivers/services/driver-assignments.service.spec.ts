import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { DriverAssignmentsService } from './driver-assignments.service';
import { DatabaseService } from '../../database/database.service';
import { DriversRepository } from '../repositories/drivers.repository';
import { DriverAssignmentsRepository } from '../repositories/driver-assignments.repository';
import { AuthenticatedUser } from '../../auth/decorators/current-user.decorator';

describe('DriverAssignmentsService', () => {
  let service: DriverAssignmentsService;
  let mockDb: any;
  let mockDriversRepo: any;
  let mockAssignmentsRepo: any;

  const adminUser: AuthenticatedUser = {
    id: '11111111-1111-4111-a111-111111111111',
    email: 'admin@movana.internal',
    roles: ['ADMIN'],
    permissions: [],
  };

  const operatorUser: AuthenticatedUser = {
    id: '22222222-2222-4222-a222-222222222222',
    email: 'operator@movana.internal',
    roles: ['OPERATOR'],
    permissions: [],
  };

  const driverUser: AuthenticatedUser = {
    id: '33333333-3333-4333-a333-333333333333',
    email: 'driver@movana.internal',
    roles: ['DRIVER'],
    permissions: [],
  };

  const otherDriverUser: AuthenticatedUser = {
    id: '44444444-4444-4444-a444-444444444444',
    email: 'otherdriver@movana.internal',
    roles: ['DRIVER'],
    permissions: [],
  };

  const validDriver: any = {
    id: '55555555-5555-4555-a555-555555555555',
    userId: driverUser.id,
    employeeCode: 'DRV-1001',
    licenseNumber: 'LIC-1001',
    licenseCategory: 'HEAVY_COMMERCIAL',
    licenseExpiryDate: '2030-01-01',
    employmentStatus: 'ACTIVE',
    verificationStatus: 'VERIFIED',
  };

  const mockAssignment = {
    id: '66666666-6666-4666-a666-666666666666',
    driver_id: validDriver.id,
    vehicle_id: '77777777-7777-4777-a777-777777777777',
    trip_id: null,
    assignment_type: 'REGULAR_SHIFT',
    start_at: new Date('2026-11-01T08:00:00Z'),
    end_at: new Date('2026-11-01T16:00:00Z'),
    status: 'SCHEDULED',
    assigned_by: adminUser.id,
    created_at: new Date(),
    updated_at: new Date(),
  };

  beforeEach(async () => {
    mockDb = {
      query: jest.fn(),
      withTransaction: jest.fn(async (callback) => {
        const client = { query: jest.fn() };
        return callback(client);
      }),
    };

    mockDriversRepo = {
      findById: jest.fn(),
      findByUserId: jest.fn(),
    };

    mockAssignmentsRepo = {
      createAssignment: jest.fn(),
      findAssignmentById: jest.fn(),
      findConflictingDriverAssignment: jest.fn(),
      findConflictingVehicleAssignment: jest.fn(),
      findAssignments: jest.fn(),
      updateAssignmentStatus: jest.fn(),
      createAvailability: jest.fn(),
      findAvailabilityByDriver: jest.fn(),
      deleteAvailability: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DriverAssignmentsService,
        { provide: DatabaseService, useValue: mockDb },
        { provide: DriversRepository, useValue: mockDriversRepo },
        { provide: DriverAssignmentsRepository, useValue: mockAssignmentsRepo },
      ],
    }).compile();

    service = module.get<DriverAssignmentsService>(DriverAssignmentsService);
  });

  describe('createAssignment', () => {
    it('should throw NotFoundException if driver is not found', async () => {
      mockDriversRepo.findById.mockResolvedValue(null);

      await expect(
        service.createAssignment(
          {
            driverId: '99999999-9999-4999-a999-999999999999',
            startAt: '2026-11-01T08:00:00Z',
            assignmentType: 'REGULAR_SHIFT',
          },
          operatorUser,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if driver is not ACTIVE', async () => {
      mockDriversRepo.findById.mockResolvedValue({
        ...validDriver,
        employmentStatus: 'SUSPENDED',
      });

      await expect(
        service.createAssignment(
          {
            driverId: validDriver.id,
            startAt: '2026-11-01T08:00:00Z',
            assignmentType: 'REGULAR_SHIFT',
          },
          operatorUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if driver is not VERIFIED', async () => {
      mockDriversRepo.findById.mockResolvedValue({
        ...validDriver,
        verificationStatus: 'PENDING',
      });

      await expect(
        service.createAssignment(
          {
            driverId: validDriver.id,
            startAt: '2026-11-01T08:00:00Z',
            assignmentType: 'REGULAR_SHIFT',
          },
          operatorUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if driver license is expired', async () => {
      mockDriversRepo.findById.mockResolvedValue({
        ...validDriver,
        licenseExpiryDate: '2020-01-01',
      });

      await expect(
        service.createAssignment(
          {
            driverId: validDriver.id,
            startAt: '2026-11-01T08:00:00Z',
            assignmentType: 'REGULAR_SHIFT',
          },
          operatorUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if vehicleId is not found', async () => {
      mockDriversRepo.findById.mockResolvedValue(validDriver);
      mockDb.query.mockResolvedValue({ rows: [] });

      await expect(
        service.createAssignment(
          {
            driverId: validDriver.id,
            vehicleId: '88888888-8888-4888-a888-888888888888',
            startAt: '2026-11-01T08:00:00Z',
            assignmentType: 'REGULAR_SHIFT',
          },
          operatorUser,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if vehicle is not ACTIVE', async () => {
      mockDriversRepo.findById.mockResolvedValue(validDriver);
      mockDb.query.mockResolvedValue({
        rows: [{ id: '88888888-8888-4888-a888-888888888888', status: 'MAINTENANCE' }],
      });

      await expect(
        service.createAssignment(
          {
            driverId: validDriver.id,
            vehicleId: '88888888-8888-4888-a888-888888888888',
            startAt: '2026-11-01T08:00:00Z',
            assignmentType: 'REGULAR_SHIFT',
          },
          operatorUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException if driver has overlapping assignment', async () => {
      mockDriversRepo.findById.mockResolvedValue(validDriver);
      mockAssignmentsRepo.findConflictingDriverAssignment.mockResolvedValue(mockAssignment);

      await expect(
        service.createAssignment(
          {
            driverId: validDriver.id,
            startAt: '2026-11-01T09:00:00Z',
            assignmentType: 'REGULAR_SHIFT',
          },
          operatorUser,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException if vehicle has overlapping assignment', async () => {
      mockDriversRepo.findById.mockResolvedValue(validDriver);
      mockDb.query.mockResolvedValue({
        rows: [{ id: '77777777-7777-4777-a777-777777777777', status: 'ACTIVE' }],
      });
      mockAssignmentsRepo.findConflictingDriverAssignment.mockResolvedValue(null);
      mockAssignmentsRepo.findConflictingVehicleAssignment.mockResolvedValue(mockAssignment);

      await expect(
        service.createAssignment(
          {
            driverId: validDriver.id,
            vehicleId: '77777777-7777-4777-a777-777777777777',
            startAt: '2026-11-01T09:00:00Z',
            assignmentType: 'REGULAR_SHIFT',
          },
          operatorUser,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('should schedule assignment cleanly and mirror vehicle_assignment when vehicle provided', async () => {
      mockDriversRepo.findById.mockResolvedValue(validDriver);
      mockDb.query.mockResolvedValue({
        rows: [{ id: '77777777-7777-4777-a777-777777777777', status: 'ACTIVE' }],
      });
      mockAssignmentsRepo.findConflictingDriverAssignment.mockResolvedValue(null);
      mockAssignmentsRepo.findConflictingVehicleAssignment.mockResolvedValue(null);
      mockAssignmentsRepo.createAssignment.mockResolvedValue(mockAssignment);

      const result = await service.createAssignment(
        {
          driverId: validDriver.id,
          vehicleId: '77777777-7777-4777-a777-777777777777',
          startAt: '2026-11-01T08:00:00Z',
          endAt: '2026-11-01T16:00:00Z',
          assignmentType: 'REGULAR_SHIFT',
        },
        operatorUser,
      );

      expect(result).toEqual(mockAssignment);
      expect(mockAssignmentsRepo.createAssignment).toHaveBeenCalled();
    });
  });

  describe('getAssignments', () => {
    it('should scope driver assignments query to own driver record if non-privileged user', async () => {
      mockDriversRepo.findByUserId.mockResolvedValue(validDriver);
      mockAssignmentsRepo.findAssignments.mockResolvedValue({
        assignments: [mockAssignment],
        total: 1,
      });

      const result = await service.getAssignments({ limit: 10, offset: 0 }, driverUser);

      expect(mockDriversRepo.findByUserId).toHaveBeenCalledWith(driverUser.id);
      expect(mockAssignmentsRepo.findAssignments).toHaveBeenCalledWith(
        expect.objectContaining({ driverId: validDriver.id }),
      );
      expect(result.total).toBe(1);
    });

    it('should allow privileged operator to query all assignments', async () => {
      mockAssignmentsRepo.findAssignments.mockResolvedValue({
        assignments: [mockAssignment],
        total: 1,
      });

      const result = await service.getAssignments({ limit: 10, offset: 0 }, operatorUser);

      expect(mockDriversRepo.findByUserId).not.toHaveBeenCalled();
      expect(result.assignments).toHaveLength(1);
    });
  });

  describe('getAssignmentById', () => {
    it('should throw NotFoundException if assignment does not exist', async () => {
      mockAssignmentsRepo.findAssignmentById.mockResolvedValue(null);

      await expect(
        service.getAssignmentById('99999999-9999-4999-a999-999999999999', adminUser),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if driver attempts to view another driver assignment', async () => {
      mockAssignmentsRepo.findAssignmentById.mockResolvedValue(mockAssignment);
      mockDriversRepo.findByUserId.mockResolvedValue({
        id: '88888888-8888-4888-a888-888888888888',
        user_id: otherDriverUser.id,
      });

      await expect(service.getAssignmentById(mockAssignment.id, otherDriverUser)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should return assignment for authorized driver', async () => {
      mockAssignmentsRepo.findAssignmentById.mockResolvedValue(mockAssignment);
      mockDriversRepo.findByUserId.mockResolvedValue(validDriver);

      const result = await service.getAssignmentById(mockAssignment.id, driverUser);
      expect(result.id).toBe(mockAssignment.id);
    });
  });

  describe('updateAssignmentStatus', () => {
    it('should throw BadRequestException if assignment is already in terminal state', async () => {
      mockAssignmentsRepo.findAssignmentById.mockResolvedValue({
        ...mockAssignment,
        status: 'COMPLETED',
      });

      await expect(
        service.updateAssignmentStatus(mockAssignment.id, { status: 'CANCELLED' }, adminUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException on invalid status transition (SCHEDULED -> COMPLETED)', async () => {
      mockAssignmentsRepo.findAssignmentById.mockResolvedValue({
        ...mockAssignment,
        status: 'SCHEDULED',
      });

      await expect(
        service.updateAssignmentStatus(mockAssignment.id, { status: 'COMPLETED' }, adminUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ForbiddenException if driver attempts to CANCEL an assignment', async () => {
      mockAssignmentsRepo.findAssignmentById.mockResolvedValue({
        ...mockAssignment,
        status: 'SCHEDULED',
      });
      mockDriversRepo.findByUserId.mockResolvedValue(validDriver);

      await expect(
        service.updateAssignmentStatus(mockAssignment.id, { status: 'CANCELLED' }, driverUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should successfully update status from SCHEDULED to ACTIVE', async () => {
      mockAssignmentsRepo.findAssignmentById.mockResolvedValue({
        ...mockAssignment,
        status: 'SCHEDULED',
      });
      mockDriversRepo.findByUserId.mockResolvedValue(validDriver);
      mockAssignmentsRepo.updateAssignmentStatus.mockResolvedValue({
        ...mockAssignment,
        status: 'ACTIVE',
      });

      const result = await service.updateAssignmentStatus(
        mockAssignment.id,
        { status: 'ACTIVE' },
        driverUser,
      );

      expect(result.status).toBe('ACTIVE');
    });
  });

  describe('availability shifts', () => {
    const mockShift = {
      id: 'aaaa1111-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
      driver_id: validDriver.id,
      day_of_week: 1,
      start_time: '08:00:00',
      end_time: '17:00:00',
      is_available: true,
      effective_date: '2026-11-01',
      created_at: new Date(),
      updated_at: new Date(),
    };

    it('should throw NotFoundException if driver not found when setting availability', async () => {
      mockDriversRepo.findById.mockResolvedValue(null);

      await expect(
        service.createAvailability(
          validDriver.id,
          { dayOfWeek: 1, startTime: '08:00', endTime: '17:00', isAvailable: true },
          driverUser,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if driver attempts to set shift for another driver', async () => {
      mockDriversRepo.findById.mockResolvedValue(validDriver);
      mockDriversRepo.findByUserId.mockResolvedValue({
        id: '99999999-9999-4999-a999-999999999999',
        user_id: otherDriverUser.id,
      });

      await expect(
        service.createAvailability(
          validDriver.id,
          { dayOfWeek: 1, startTime: '08:00', endTime: '17:00', isAvailable: true },
          otherDriverUser,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should successfully add shift availability', async () => {
      mockDriversRepo.findById.mockResolvedValue(validDriver);
      mockDriversRepo.findByUserId.mockResolvedValue(validDriver);
      mockAssignmentsRepo.createAvailability.mockResolvedValue(mockShift);

      const result = await service.createAvailability(
        validDriver.id,
        { dayOfWeek: 1, startTime: '08:00', endTime: '17:00', isAvailable: true },
        driverUser,
      );

      expect(result).toEqual(mockShift);
    });
  });
});
