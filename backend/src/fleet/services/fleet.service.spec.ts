import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { FleetService } from './fleet.service';
import { DatabaseService } from '../../database/database.service';
import { FleetRepository } from '../repositories/fleet.repository';
import { AuthenticatedUser } from '../../auth/decorators/current-user.decorator';

describe('FleetService', () => {
  let service: FleetService;
  let mockDb: any;
  let mockFleetRepo: any;

  const fleetManagerUser: AuthenticatedUser = {
    id: '11111111-1111-4111-a111-111111111111',
    email: 'fleet@movana.internal',
    roles: ['FLEET_MANAGER'],
    permissions: [],
  };

  const mockVehicleType = {
    id: '22222222-2222-4222-a222-222222222222',
    code: 'STANDARD_CITY',
    name: 'Standard City Bus',
    description: 'City bus class',
    default_fare_multiplier: 1.0,
    is_active: true,
    created_at: new Date(),
  };

  const mockManufacturer = {
    id: '33333333-3333-4333-a333-333333333333',
    name: 'Volvo Buses',
    country: 'Sweden',
    website: 'https://www.volvobuses.com',
    created_at: new Date(),
  };

  const mockModel = {
    id: '44444444-4444-4444-a444-444444444444',
    manufacturer_id: mockManufacturer.id,
    name: '7900 Electric',
    release_year: 2024,
    default_capacity: 50,
    created_at: new Date(),
  };

  const mockVehicle: any = {
    id: '55555555-5555-4555-a555-555555555555',
    registration_number: 'KA-01-EQ-1234',
    vehicle_code: 'BUS-101',
    vehicle_type_id: mockVehicleType.id,
    manufacturer_id: mockManufacturer.id,
    model_id: mockModel.id,
    model_year: 2024,
    vin: '1V9BUS12345678901',
    engine_number: 'ENG-987654',
    capacity: 50,
    standing_capacity: 15,
    seat_capacity: 35,
    fuel_type: 'ELECTRIC',
    status: 'ACTIVE',
    current_odometer: 1200.5,
    current_latitude: null,
    current_longitude: null,
    last_location_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    deleted_at: null,
  };

  beforeEach(async () => {
    mockDb = {
      query: jest.fn(),
      withTransaction: jest.fn(async (callback) => {
        const client = { query: jest.fn() };
        return callback(client);
      }),
    };

    mockFleetRepo = {
      createVehicle: jest.fn(),
      findVehicleById: jest.fn(),
      findVehicleByRegistrationNumber: jest.fn(),
      findVehicleByCode: jest.fn(),
      findVehicleByVin: jest.fn(),
      findVehicles: jest.fn(),
      updateVehicle: jest.fn(),
      updateVehicleStatus: jest.fn(),
      recordStatusHistory: jest.fn(),
      updateTelemetry: jest.fn(),
      softDeleteVehicle: jest.fn(),
      findVehicleTypes: jest.fn(),
      findVehicleTypeById: jest.fn(),
      findVehicleModels: jest.fn(),
      findVehicleModelById: jest.fn(),
      findManufacturers: jest.fn(),
      findManufacturerById: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FleetService,
        { provide: DatabaseService, useValue: mockDb },
        { provide: FleetRepository, useValue: mockFleetRepo },
      ],
    }).compile();

    service = module.get<FleetService>(FleetService);
  });

  describe('createVehicle', () => {
    const validDto = {
      registrationNumber: 'KA-01-EQ-1234',
      vehicleCode: 'BUS-101',
      vehicleTypeId: mockVehicleType.id,
      manufacturerId: mockManufacturer.id,
      modelId: mockModel.id,
      modelYear: 2024,
      vin: '1V9BUS12345678901',
      engineNumber: 'ENG-987654',
      seatCapacity: 35,
      standingCapacity: 15,
      capacity: 50,
      fuelType: 'ELECTRIC' as const,
      currentOdometer: 0,
    };

    it('should throw NotFoundException if vehicleTypeId does not exist', async () => {
      mockFleetRepo.findVehicleTypeById.mockResolvedValue(null);
      mockFleetRepo.findManufacturerById.mockResolvedValue(mockManufacturer);
      mockFleetRepo.findVehicleModelById.mockResolvedValue(mockModel);

      await expect(service.createVehicle(validDto, fleetManagerUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException if manufacturerId does not exist', async () => {
      mockFleetRepo.findVehicleTypeById.mockResolvedValue(mockVehicleType);
      mockFleetRepo.findManufacturerById.mockResolvedValue(null);
      mockFleetRepo.findVehicleModelById.mockResolvedValue(mockModel);

      await expect(service.createVehicle(validDto, fleetManagerUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException if modelId does not exist', async () => {
      mockFleetRepo.findVehicleTypeById.mockResolvedValue(mockVehicleType);
      mockFleetRepo.findManufacturerById.mockResolvedValue(mockManufacturer);
      mockFleetRepo.findVehicleModelById.mockResolvedValue(null);

      await expect(service.createVehicle(validDto, fleetManagerUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException if model does not belong to specified manufacturer', async () => {
      mockFleetRepo.findVehicleTypeById.mockResolvedValue(mockVehicleType);
      mockFleetRepo.findManufacturerById.mockResolvedValue(mockManufacturer);
      mockFleetRepo.findVehicleModelById.mockResolvedValue({
        ...mockModel,
        manufacturer_id: '99999999-9999-4999-a999-999999999999',
      });

      await expect(service.createVehicle(validDto, fleetManagerUser)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw ConflictException if registration number is already registered', async () => {
      mockFleetRepo.findVehicleTypeById.mockResolvedValue(mockVehicleType);
      mockFleetRepo.findManufacturerById.mockResolvedValue(mockManufacturer);
      mockFleetRepo.findVehicleModelById.mockResolvedValue(mockModel);
      mockFleetRepo.findVehicleByRegistrationNumber.mockResolvedValue(mockVehicle);

      await expect(service.createVehicle(validDto, fleetManagerUser)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw ConflictException if vehicle code is already registered', async () => {
      mockFleetRepo.findVehicleTypeById.mockResolvedValue(mockVehicleType);
      mockFleetRepo.findManufacturerById.mockResolvedValue(mockManufacturer);
      mockFleetRepo.findVehicleModelById.mockResolvedValue(mockModel);
      mockFleetRepo.findVehicleByRegistrationNumber.mockResolvedValue(null);
      mockFleetRepo.findVehicleByCode.mockResolvedValue(mockVehicle);

      await expect(service.createVehicle(validDto, fleetManagerUser)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw ConflictException if VIN is already registered', async () => {
      mockFleetRepo.findVehicleTypeById.mockResolvedValue(mockVehicleType);
      mockFleetRepo.findManufacturerById.mockResolvedValue(mockManufacturer);
      mockFleetRepo.findVehicleModelById.mockResolvedValue(mockModel);
      mockFleetRepo.findVehicleByRegistrationNumber.mockResolvedValue(null);
      mockFleetRepo.findVehicleByCode.mockResolvedValue(null);
      mockFleetRepo.findVehicleByVin.mockResolvedValue(mockVehicle);

      await expect(service.createVehicle(validDto, fleetManagerUser)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should successfully create vehicle when valid', async () => {
      mockFleetRepo.findVehicleTypeById.mockResolvedValue(mockVehicleType);
      mockFleetRepo.findManufacturerById.mockResolvedValue(mockManufacturer);
      mockFleetRepo.findVehicleModelById.mockResolvedValue(mockModel);
      mockFleetRepo.findVehicleByRegistrationNumber.mockResolvedValue(null);
      mockFleetRepo.findVehicleByCode.mockResolvedValue(null);
      mockFleetRepo.findVehicleByVin.mockResolvedValue(null);
      mockFleetRepo.createVehicle.mockResolvedValue(mockVehicle);

      const res = await service.createVehicle(validDto, fleetManagerUser);
      expect(res).toEqual(mockVehicle);
      expect(mockFleetRepo.createVehicle).toHaveBeenCalledWith(
        expect.objectContaining({
          registrationNumber: validDto.registrationNumber,
          capacity: 50,
        }),
      );
    });
  });

  describe('getVehicles & getVehicleById', () => {
    it('should return paginated vehicle inventory', async () => {
      mockFleetRepo.findVehicles.mockResolvedValue({
        vehicles: [mockVehicle],
        total: 1,
      });

      const res = await service.getVehicles({ limit: 10, offset: 0 });
      expect(res.vehicles).toHaveLength(1);
      expect(res.total).toBe(1);
    });

    it('should throw NotFoundException if vehicle does not exist', async () => {
      mockFleetRepo.findVehicleById.mockResolvedValue(null);

      await expect(service.getVehicleById('99999999-9999-4999-a999-999999999999')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return vehicle details', async () => {
      mockFleetRepo.findVehicleById.mockResolvedValue(mockVehicle);

      const res = await service.getVehicleById(mockVehicle.id);
      expect(res).toEqual(mockVehicle);
    });
  });

  describe('updateVehicle', () => {
    it('should throw BadRequestException if vehicle is DECOMMISSIONED', async () => {
      mockFleetRepo.findVehicleById.mockResolvedValue({
        ...mockVehicle,
        status: 'DECOMMISSIONED',
      });

      await expect(
        service.updateVehicle(mockVehicle.id, { seatCapacity: 40 }, fleetManagerUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('should update vehicle specifications successfully', async () => {
      mockFleetRepo.findVehicleById.mockResolvedValue(mockVehicle);
      mockFleetRepo.updateVehicle.mockResolvedValue({
        ...mockVehicle,
        seat_capacity: 40,
        capacity: 55,
      });

      const res = await service.updateVehicle(
        mockVehicle.id,
        { seatCapacity: 40, capacity: 55 },
        fleetManagerUser,
      );

      expect(res.seat_capacity).toBe(40);
    });
  });

  describe('updateVehicleStatus', () => {
    it('should throw BadRequestException if transitioning from DECOMMISSIONED', async () => {
      mockFleetRepo.findVehicleById.mockResolvedValue({
        ...mockVehicle,
        status: 'DECOMMISSIONED',
      });

      await expect(
        service.updateVehicleStatus(
          mockVehicle.id,
          { status: 'ACTIVE', reason: 'Reactivation attempt' },
          fleetManagerUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should transition status and record audit log in transaction', async () => {
      mockFleetRepo.findVehicleById.mockResolvedValue(mockVehicle);
      mockFleetRepo.updateVehicleStatus.mockResolvedValue({
        ...mockVehicle,
        status: 'MAINTENANCE',
      });

      const res = await service.updateVehicleStatus(
        mockVehicle.id,
        { status: 'MAINTENANCE', reason: 'Engine inspection' },
        fleetManagerUser,
      );

      expect(res.status).toBe('MAINTENANCE');
      expect(mockFleetRepo.recordStatusHistory).toHaveBeenCalled();
    });
  });

  describe('updateVehicleTelemetry', () => {
    it('should update GPS coordinates and odometer', async () => {
      mockFleetRepo.findVehicleById.mockResolvedValue(mockVehicle);
      mockFleetRepo.updateTelemetry.mockResolvedValue({
        ...mockVehicle,
        current_latitude: 12.9716,
        current_longitude: 77.5946,
      });

      const res = await service.updateVehicleTelemetry(mockVehicle.id, {
        latitude: 12.9716,
        longitude: 77.5946,
        odometer: 1350.2,
      });

      expect(res.current_latitude).toBe(12.9716);
    });
  });

  describe('deleteVehicle', () => {
    it('should soft-delete vehicle and record decommission audit log', async () => {
      mockFleetRepo.findVehicleById.mockResolvedValue(mockVehicle);

      await service.deleteVehicle(mockVehicle.id, fleetManagerUser);

      expect(mockFleetRepo.softDeleteVehicle).toHaveBeenCalled();
      expect(mockFleetRepo.recordStatusHistory).toHaveBeenCalledWith(
        mockVehicle.id,
        mockVehicle.status,
        'DECOMMISSIONED',
        expect.any(String),
        fleetManagerUser.id,
        expect.anything(),
      );
    });
  });
});
