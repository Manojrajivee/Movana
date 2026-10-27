import { Test, TestingModule } from '@nestjs/testing';
import { DriversController } from './drivers.controller';
import { DriversService } from '../services/drivers.service';
import { AuthenticatedUser } from '../../auth/decorators/current-user.decorator';

describe('DriversController (Unit Tests)', () => {
  let controller: DriversController;
  let driversService: jest.Mocked<Partial<DriversService>>;

  const mockUser: AuthenticatedUser = {
    id: '11111111-1111-4111-a111-111111111111',
    email: 'operator@movana.com',
    roles: ['OPERATOR'],
    permissions: [],
  };

  const mockDriver: any = {
    id: 'dddddddd-dddd-4ddd-addd-dddddddddddd',
    userId: '22222222-2222-4222-a222-222222222222',
    employeeCode: 'EMP-001',
    licenseNumber: 'DL-KA-2020-001',
    licenseCategory: 'HEAVY_PASSENGER',
    licenseExpiryDate: '2030-12-31',
    employmentStatus: 'ACTIVE',
  };

  beforeEach(async () => {
    driversService = {
      createDriver: jest.fn().mockResolvedValue(mockDriver),
      getMyDriverProfile: jest.fn().mockResolvedValue(mockDriver),
      getDriverById: jest.fn().mockResolvedValue(mockDriver),
      updateDriver: jest.fn().mockResolvedValue(mockDriver),
      updateDriverStatus: jest.fn().mockResolvedValue({
        success: true,
        message: 'Driver status successfully transitioned to ON_LEAVE',
      }),
      listDrivers: jest.fn().mockResolvedValue({ items: [mockDriver], total: 1 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DriversController],
      providers: [{ provide: DriversService, useValue: driversService }],
    }).compile();

    controller = module.get<DriversController>(DriversController);
  });

  it('createDriver should delegate to driversService.createDriver', async () => {
    const dto = {
      userId: '22222222-2222-4222-a222-222222222222',
      employeeCode: 'EMP-001',
      licenseNumber: 'DL-KA-2020-001',
      licenseCategory: 'HEAVY_PASSENGER',
      licenseExpiryDate: '2030-12-31',
    };

    const result = await controller.createDriver(dto, mockUser);
    expect(result).toEqual(mockDriver);
    expect(driversService.createDriver).toHaveBeenCalledWith(dto, mockUser);
  });

  it('getMyDriverProfile should delegate to driversService.getMyDriverProfile', async () => {
    const result = await controller.getMyDriverProfile(mockUser);
    expect(result).toEqual(mockDriver);
    expect(driversService.getMyDriverProfile).toHaveBeenCalledWith(mockUser);
  });

  it('getDriverById should delegate to driversService.getDriverById', async () => {
    const result = await controller.getDriverById(mockDriver.id, mockUser);
    expect(result).toEqual(mockDriver);
    expect(driversService.getDriverById).toHaveBeenCalledWith(mockDriver.id, mockUser);
  });

  it('updateDriver should delegate to driversService.updateDriver', async () => {
    const dto = { licenseCategory: 'HEAVY_COMMERCIAL' };
    const result = await controller.updateDriver(mockDriver.id, dto, mockUser);
    expect(result).toEqual(mockDriver);
    expect(driversService.updateDriver).toHaveBeenCalledWith(mockDriver.id, dto, mockUser);
  });

  it('updateDriverStatus should delegate to driversService.updateDriverStatus', async () => {
    const dto = { status: 'ON_LEAVE' as const, reason: 'Vacation' };
    const result = await controller.updateDriverStatus(mockDriver.id, dto, mockUser);
    expect(result.success).toBe(true);
    expect(driversService.updateDriverStatus).toHaveBeenCalledWith(mockDriver.id, dto, mockUser);
  });

  it('listDrivers should delegate to driversService.listDrivers', async () => {
    const query = { page: 1, limit: 10, search: 'EMP' };
    const result = await controller.listDrivers(query as any);
    expect(result.items).toHaveLength(1);
    expect(driversService.listDrivers).toHaveBeenCalled();
  });
});
