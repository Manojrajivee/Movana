import { Test, TestingModule } from '@nestjs/testing';
import { FleetController } from './fleet.controller';
import { FleetService } from '../services/fleet.service';
import { AuthenticatedUser } from '../../auth/decorators/current-user.decorator';

describe('FleetController', () => {
  let controller: FleetController;
  let mockService: any;

  const mockUser: AuthenticatedUser = {
    id: '11111111-1111-4111-a111-111111111111',
    email: 'fleet@movana.internal',
    roles: ['FLEET_MANAGER'],
    permissions: [],
  };

  const vehicleId = '55555555-5555-4555-a555-555555555555';

  const mockVehicle: any = {
    id: vehicleId,
    registration_number: 'KA-01-EQ-1234',
    vehicle_code: 'BUS-101',
    capacity: 50,
    seat_capacity: 35,
    standing_capacity: 15,
    status: 'ACTIVE',
  };

  beforeEach(async () => {
    mockService = {
      getVehicleTypes: jest.fn().mockResolvedValue([]),
      getVehicleModels: jest.fn().mockResolvedValue([]),
      getManufacturers: jest.fn().mockResolvedValue([]),
      createVehicle: jest.fn().mockResolvedValue(mockVehicle),
      getVehicles: jest.fn().mockResolvedValue({ vehicles: [mockVehicle], total: 1 }),
      getVehicleById: jest.fn().mockResolvedValue(mockVehicle),
      updateVehicle: jest.fn().mockResolvedValue(mockVehicle),
      updateVehicleStatus: jest.fn().mockResolvedValue(mockVehicle),
      updateVehicleTelemetry: jest.fn().mockResolvedValue(mockVehicle),
      deleteVehicle: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [FleetController],
      providers: [{ provide: FleetService, useValue: mockService }],
    }).compile();

    controller = module.get<FleetController>(FleetController);
  });

  it('should list vehicle types', async () => {
    await controller.getVehicleTypes();
    expect(mockService.getVehicleTypes).toHaveBeenCalled();
  });

  it('should create vehicle', async () => {
    const dto: any = {
      registrationNumber: 'KA-01-EQ-1234',
      vehicleCode: 'BUS-101',
      vehicleTypeId: '22222222-2222-4222-a222-222222222222',
      manufacturerId: '33333333-3333-4333-a333-333333333333',
      modelId: '44444444-4444-4444-a444-444444444444',
      modelYear: 2024,
      vin: '1V9BUS12345678901',
      engineNumber: 'ENG-987654',
      seatCapacity: 35,
      standingCapacity: 15,
      capacity: 50,
      fuelType: 'ELECTRIC',
      currentOdometer: 0,
    };

    const res = await controller.createVehicle(dto, mockUser);
    expect(res).toEqual(mockVehicle);
    expect(mockService.createVehicle).toHaveBeenCalled();
  });

  it('should list vehicles', async () => {
    const res = await controller.getVehicles({ limit: 10, offset: 0 });
    expect(res.vehicles).toHaveLength(1);
    expect(res.total).toBe(1);
  });

  it('should get vehicle by ID', async () => {
    const res = await controller.getVehicleById(vehicleId);
    expect(res).toEqual(mockVehicle);
  });

  it('should update vehicle status', async () => {
    const res = await controller.updateVehicleStatus(
      vehicleId,
      { status: 'MAINTENANCE', reason: 'Routine service' },
      mockUser,
    );
    expect(res).toEqual(mockVehicle);
  });

  it('should update telemetry', async () => {
    const res = await controller.updateVehicleTelemetry(vehicleId, {
      latitude: 12.9716,
      longitude: 77.5946,
    });
    expect(res).toEqual(mockVehicle);
  });

  it('should delete vehicle', async () => {
    await controller.deleteVehicle(vehicleId, mockUser);
    expect(mockService.deleteVehicle).toHaveBeenCalledWith(vehicleId, mockUser);
  });
});
