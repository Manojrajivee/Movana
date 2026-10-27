import { Test, TestingModule } from '@nestjs/testing';
import { VehicleMaintenanceController } from './vehicle-maintenance.controller';
import { VehicleMaintenanceService } from '../services/vehicle-maintenance.service';

describe('VehicleMaintenanceController', () => {
  let controller: VehicleMaintenanceController;
  let service: jest.Mocked<VehicleMaintenanceService>;

  const mockUser: any = {
    id: 'user-fm-1',
    roles: ['FLEET_MANAGER'],
  };

  const mockSchedule: any = {
    id: '11111111-1111-4111-a111-111111111111',
    service_name: 'Brake Inspection',
    interval_km: 10000,
    interval_days: 90,
  };

  const mockRecord: any = {
    id: '22222222-2222-4222-a222-222222222222',
    vehicle_id: '33333333-3333-4333-a333-333333333333',
    status: 'SCHEDULED',
  };

  const mockInspection: any = {
    id: '44444444-4444-4444-a444-444444444444',
    vehicle_id: '33333333-3333-4333-a333-333333333333',
    status: 'PASSED',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [VehicleMaintenanceController],
      providers: [
        {
          provide: VehicleMaintenanceService,
          useValue: {
            createSchedule: jest.fn().mockResolvedValue(mockSchedule),
            getSchedules: jest.fn().mockResolvedValue([mockSchedule]),
            getScheduleById: jest.fn().mockResolvedValue(mockSchedule),
            createRecord: jest.fn().mockResolvedValue(mockRecord),
            getRecords: jest.fn().mockResolvedValue({ records: [mockRecord], total: 1 }),
            getRecordById: jest.fn().mockResolvedValue(mockRecord),
            updateRecordStatus: jest
              .fn()
              .mockResolvedValue({ ...mockRecord, status: 'IN_PROGRESS' }),
            createInspection: jest.fn().mockResolvedValue(mockInspection),
            getInspections: jest
              .fn()
              .mockResolvedValue({ inspections: [mockInspection], total: 1 }),
            getInspectionById: jest.fn().mockResolvedValue(mockInspection),
          },
        },
      ],
    }).compile();

    controller = module.get<VehicleMaintenanceController>(VehicleMaintenanceController);
    service = module.get(VehicleMaintenanceService);
  });

  it('should create schedule', async () => {
    const body = {
      serviceName: 'Brake Inspection',
      intervalKm: 10000,
      intervalDays: 90,
    };
    const res = await controller.createSchedule(body, mockUser);
    expect(res.id).toBe(mockSchedule.id);
    expect(service.createSchedule).toHaveBeenCalled();
  });

  it('should list schedules', async () => {
    const res = await controller.getSchedules({}, mockUser);
    expect(res.length).toBe(1);
  });

  it('should get schedule by ID', async () => {
    const res = await controller.getScheduleById('11111111-1111-4111-a111-111111111111', mockUser);
    expect(res.id).toBe(mockSchedule.id);
  });

  it('should create maintenance record', async () => {
    const body = {
      vehicleId: '33333333-3333-4333-a333-333333333333',
      maintenanceType: 'SCHEDULED',
      scheduledDate: '2026-11-15',
      odometer: 10000,
      cost: 500,
      vendor: 'Tata Garage',
      description: 'Oil check',
      technician: 'Ramesh',
    };
    const res = await controller.createRecord(body, mockUser);
    expect(res.id).toBe(mockRecord.id);
  });

  it('should update maintenance record status', async () => {
    const body = { status: 'IN_PROGRESS' };
    const res = await controller.updateRecordStatus(
      '22222222-2222-4222-a222-222222222222',
      body,
      mockUser,
    );
    expect(res.status).toBe('IN_PROGRESS');
  });

  it('should create inspection', async () => {
    const body = {
      vehicleId: '33333333-3333-4333-a333-333333333333',
      inspectionType: 'PRE_TRIP',
      status: 'PASSED',
      odometer: 10500,
    };
    const res = await controller.createInspection(body, mockUser);
    expect(res.id).toBe(mockInspection.id);
  });
});
