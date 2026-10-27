import { Test, TestingModule } from '@nestjs/testing';
import { DriverAvailabilityController } from './driver-availability.controller';
import { DriverAssignmentsService } from '../services/driver-assignments.service';
import { AuthenticatedUser } from '../../auth/decorators/current-user.decorator';

describe('DriverAvailabilityController', () => {
  let controller: DriverAvailabilityController;
  let mockService: any;

  const mockUser: AuthenticatedUser = {
    id: '33333333-3333-4333-a333-333333333333',
    email: 'driver@movana.internal',
    roles: ['DRIVER'],
    permissions: [],
  };

  const driverId = '55555555-5555-4555-a555-555555555555';
  const availId = 'aaaa1111-aaaa-4aaa-aaaa-aaaaaaaaaaaa';

  const mockShift: any = {
    id: availId,
    driver_id: driverId,
    day_of_week: 1,
    start_time: '08:00:00',
    end_time: '17:00:00',
    is_available: true,
    effective_date: '2026-11-01',
    created_at: new Date(),
    updated_at: new Date(),
  };

  beforeEach(async () => {
    mockService = {
      createAvailability: jest.fn(),
      getAvailability: jest.fn(),
      deleteAvailability: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DriverAvailabilityController],
      providers: [{ provide: DriverAssignmentsService, useValue: mockService }],
    }).compile();

    controller = module.get<DriverAvailabilityController>(DriverAvailabilityController);
  });

  it('should create driver availability shift', async () => {
    mockService.createAvailability.mockResolvedValue(mockShift);

    const dto = {
      dayOfWeek: 1,
      startTime: '08:00',
      endTime: '17:00',
      isAvailable: true,
    };

    const res = await controller.createAvailability(driverId, dto, mockUser);
    expect(res).toEqual(mockShift);
    expect(mockService.createAvailability).toHaveBeenCalledWith(
      driverId,
      expect.objectContaining({ dayOfWeek: 1 }),
      mockUser,
    );
  });

  it('should list driver availability shifts', async () => {
    mockService.getAvailability.mockResolvedValue([mockShift]);

    const res = await controller.getAvailability(driverId, mockUser);
    expect(res).toEqual([mockShift]);
    expect(mockService.getAvailability).toHaveBeenCalledWith(driverId, mockUser);
  });

  it('should delete a driver availability shift', async () => {
    mockService.deleteAvailability.mockResolvedValue(undefined);

    await controller.deleteAvailability(driverId, availId, mockUser);
    expect(mockService.deleteAvailability).toHaveBeenCalledWith(driverId, availId, mockUser);
  });
});
