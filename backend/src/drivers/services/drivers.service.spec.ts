import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { DriversService } from './drivers.service';
import { DriversRepository, DriverEntity } from '../repositories/drivers.repository';
import { AuthenticatedUser } from '../../auth/decorators/current-user.decorator';

describe('DriversService (Unit Tests)', () => {
  let service: DriversService;
  let driversRepo: Record<keyof DriversRepository, jest.Mock>;

  const driverUser: AuthenticatedUser = {
    id: '11111111-1111-4111-a111-111111111111',
    email: 'driver@movana.com',
    roles: ['DRIVER'],
    permissions: [],
  };

  const operatorUser: AuthenticatedUser = {
    id: '22222222-2222-4222-a222-222222222222',
    email: 'operator@movana.com',
    roles: ['OPERATOR'],
    permissions: [],
  };

  const adminUser: AuthenticatedUser = {
    id: '33333333-3333-4333-a333-333333333333',
    email: 'admin@movana.com',
    roles: ['ADMIN'],
    permissions: [],
  };

  const passengerUser: AuthenticatedUser = {
    id: '44444444-4444-4444-a444-444444444444',
    email: 'passenger@movana.com',
    roles: ['PASSENGER'],
    permissions: [],
  };

  const mockDriver: DriverEntity = {
    id: 'dddddddd-dddd-4ddd-addd-dddddddddddd',
    userId: driverUser.id,
    employeeCode: 'EMP-001',
    licenseNumber: 'DL-KA-2020-001',
    licenseCategory: 'HEAVY_PASSENGER',
    licenseExpiryDate: '2030-12-31',
    dateOfJoining: '2024-01-01',
    employmentStatus: 'ACTIVE',
    verificationStatus: 'PENDING',
    ratingAverage: 5.0,
    totalTrips: 10,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    user: {
      id: driverUser.id,
      email: 'driver@movana.com',
      firstName: 'Rajesh',
      lastName: 'Kumar',
      phone: '+919876543210',
      status: 'ACTIVE',
    },
    emergencyContact: null,
  };

  beforeEach(async () => {
    driversRepo = {
      create: jest.fn(),
      findById: jest.fn(),
      findByUserId: jest.fn(),
      findByEmployeeCode: jest.fn(),
      findByLicenseNumber: jest.fn(),
      update: jest.fn(),
      updateStatus: jest.fn(),
      findAll: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [DriversService, { provide: DriversRepository, useValue: driversRepo }],
    }).compile();

    service = module.get<DriversService>(DriversService);
  });

  describe('createDriver', () => {
    const validDto = {
      userId: '55555555-5555-4555-a555-555555555555',
      employeeCode: 'EMP-002',
      licenseNumber: 'DL-MH-2022-002',
      licenseCategory: 'HEAVY_PASSENGER',
      licenseExpiryDate: '2029-06-30',
    };

    it('should provision driver when data is valid and unique', async () => {
      driversRepo.findByUserId.mockResolvedValue(null);
      driversRepo.findByEmployeeCode.mockResolvedValue(null);
      driversRepo.findByLicenseNumber.mockResolvedValue(null);
      driversRepo.create.mockResolvedValue(mockDriver);

      const result = await service.createDriver(validDto, operatorUser);
      expect(result).toEqual(mockDriver);
      expect(driversRepo.create).toHaveBeenCalled();
    });

    it('should throw BadRequestException if license expiry date is in the past', async () => {
      await expect(
        service.createDriver({ ...validDto, licenseExpiryDate: '2020-01-01' }, operatorUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException if user already has a driver profile', async () => {
      driversRepo.findByUserId.mockResolvedValue(mockDriver);

      await expect(service.createDriver(validDto, operatorUser)).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException if employee code is already taken', async () => {
      driversRepo.findByUserId.mockResolvedValue(null);
      driversRepo.findByEmployeeCode.mockResolvedValue(mockDriver);

      await expect(service.createDriver(validDto, operatorUser)).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException if license number is already taken', async () => {
      driversRepo.findByUserId.mockResolvedValue(null);
      driversRepo.findByEmployeeCode.mockResolvedValue(null);
      driversRepo.findByLicenseNumber.mockResolvedValue(mockDriver);

      await expect(service.createDriver(validDto, operatorUser)).rejects.toThrow(ConflictException);
    });
  });

  describe('getMyDriverProfile', () => {
    it('should return driver profile for authenticated driver user', async () => {
      driversRepo.findByUserId.mockResolvedValue(mockDriver);

      const result = await service.getMyDriverProfile(driverUser);
      expect(result).toEqual(mockDriver);
      expect(driversRepo.findByUserId).toHaveBeenCalledWith(driverUser.id);
    });

    it('should throw NotFoundException if driver profile is not found', async () => {
      driversRepo.findByUserId.mockResolvedValue(null);

      await expect(service.getMyDriverProfile(driverUser)).rejects.toThrow(NotFoundException);
    });
  });

  describe('getDriverById', () => {
    it('should allow owner to view driver profile', async () => {
      driversRepo.findById.mockResolvedValue(mockDriver);

      const result = await service.getDriverById(mockDriver.id, driverUser);
      expect(result).toEqual(mockDriver);
    });

    it('should allow OPERATOR to view driver profile', async () => {
      driversRepo.findById.mockResolvedValue(mockDriver);

      const result = await service.getDriverById(mockDriver.id, operatorUser);
      expect(result).toEqual(mockDriver);
    });

    it('should throw ForbiddenException if regular passenger attempts to view driver profile', async () => {
      driversRepo.findById.mockResolvedValue(mockDriver);

      await expect(service.getDriverById(mockDriver.id, passengerUser)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw NotFoundException if driver does not exist', async () => {
      driversRepo.findById.mockResolvedValue(null);

      await expect(service.getDriverById('non-existent-id', operatorUser)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateDriver', () => {
    it('should update driver details when authorized', async () => {
      driversRepo.findById.mockResolvedValue(mockDriver);
      driversRepo.update.mockResolvedValue({
        ...mockDriver,
        licenseCategory: 'HEAVY_COMMERCIAL_TRAILER',
      });

      const result = await service.updateDriver(
        mockDriver.id,
        { licenseCategory: 'HEAVY_COMMERCIAL_TRAILER' },
        operatorUser,
      );
      expect(result.licenseCategory).toBe('HEAVY_COMMERCIAL_TRAILER');
      expect(driversRepo.update).toHaveBeenCalled();
    });

    it('should throw BadRequestException if updating with expired license date', async () => {
      driversRepo.findById.mockResolvedValue(mockDriver);

      await expect(
        service.updateDriver(mockDriver.id, { licenseExpiryDate: '2021-01-01' }, operatorUser),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateDriverStatus', () => {
    it('should successfully transition driver status', async () => {
      driversRepo.findById.mockResolvedValue(mockDriver);
      driversRepo.updateStatus.mockResolvedValue(true);

      const result = await service.updateDriverStatus(
        mockDriver.id,
        { status: 'ON_LEAVE', reason: 'Annual medical leave' },
        operatorUser,
      );
      expect(result.success).toBe(true);
      expect(driversRepo.updateStatus).toHaveBeenCalledWith(
        mockDriver.id,
        'ON_LEAVE',
        'Annual medical leave',
        operatorUser.id,
      );
    });

    it('should prevent non-admin from reactivating terminated driver', async () => {
      driversRepo.findById.mockResolvedValue({
        ...mockDriver,
        employmentStatus: 'TERMINATED',
      });

      await expect(
        service.updateDriverStatus(
          mockDriver.id,
          { status: 'ACTIVE', reason: 'Rehire attempt' },
          operatorUser,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow ADMIN to reactivate terminated driver', async () => {
      driversRepo.findById.mockResolvedValue({
        ...mockDriver,
        employmentStatus: 'TERMINATED',
      });
      driversRepo.updateStatus.mockResolvedValue(true);

      const result = await service.updateDriverStatus(
        mockDriver.id,
        { status: 'ACTIVE', reason: 'Executive rehire' },
        adminUser,
      );
      expect(result.success).toBe(true);
    });
  });

  describe('listDrivers', () => {
    it('should delegate query options to repository', async () => {
      const mockResult = {
        items: [mockDriver],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      };
      driversRepo.findAll.mockResolvedValue(mockResult);

      const result = await service.listDrivers({
        page: 1,
        limit: 20,
        search: 'Rajesh',
        employmentStatus: 'ACTIVE',
      });
      expect(result).toEqual(mockResult);
      expect(driversRepo.findAll).toHaveBeenCalledWith({
        page: 1,
        limit: 20,
        search: 'Rajesh',
        employmentStatus: 'ACTIVE',
        verificationStatus: undefined,
      });
    });
  });
});
