import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { VehicleMaintenanceService } from './vehicle-maintenance.service';
import { VehicleMaintenanceRepository } from '../repositories/vehicle-maintenance.repository';
import { FleetRepository } from '../../fleet/repositories/fleet.repository';
import { DatabaseService } from '../../database/database.service';

describe('VehicleMaintenanceService', () => {
  let service: VehicleMaintenanceService;
  let maintRepo: jest.Mocked<VehicleMaintenanceRepository>;
  let fleetRepo: jest.Mocked<FleetRepository>;

  const mockUser: any = {
    id: 'user-fm-1',
    roles: ['FLEET_MANAGER'],
  };

  const mockVehicle: any = {
    id: 'veh-1',
    registration_number: 'KA-01-EQ-2002',
    vehicle_code: 'BUS-202',
    status: 'ACTIVE',
    current_odometer: 15000.0,
  };

  const mockSchedule: any = {
    id: 'sched-1',
    service_name: 'Brake Inspection & Fluid Replacement',
    vehicle_id: 'veh-1',
    vehicle_type_id: null,
    interval_km: 15000,
    interval_days: 90,
    description: 'Quarterly brake checks',
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const mockRecord: any = {
    id: 'rec-1',
    vehicle_id: 'veh-1',
    maintenance_type: 'SCHEDULED',
    scheduled_date: '2026-11-15',
    completed_date: null,
    odometer: 15200.0,
    cost: 4500.0,
    currency: 'INR',
    vendor: 'Ashok Leyland Authorized Garage',
    description: 'Brake pad replacement and hydraulic check',
    technician: 'Ramesh Kumar',
    next_due_date: '2027-02-15',
    status: 'SCHEDULED',
    created_at: new Date(),
    updated_at: new Date(),
  };

  const mockInspection: any = {
    id: 'insp-1',
    vehicle_id: 'veh-1',
    inspection_type: 'PRE_TRIP',
    inspector_id: 'user-fm-1',
    trip_id: null,
    status: 'PASSED',
    odometer: 15250.0,
    notes: 'All fluids and safety equipment verified',
    created_at: new Date(),
    updated_at: new Date(),
  };

  beforeEach(async () => {
    const mockClient = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VehicleMaintenanceService,
        {
          provide: VehicleMaintenanceRepository,
          useValue: {
            createSchedule: jest.fn(),
            findSchedules: jest.fn(),
            findScheduleById: jest.fn(),
            createRecord: jest.fn(),
            findRecords: jest.fn(),
            findRecordById: jest.fn(),
            updateRecordStatus: jest.fn(),
            createInspection: jest.fn(),
            findInspections: jest.fn(),
            findInspectionById: jest.fn(),
          },
        },
        {
          provide: FleetRepository,
          useValue: {
            findVehicleById: jest.fn(),
            findVehicleTypeById: jest.fn(),
            updateVehicleStatus: jest.fn(),
            recordStatusHistory: jest.fn(),
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

    service = module.get<VehicleMaintenanceService>(VehicleMaintenanceService);
    maintRepo = module.get(VehicleMaintenanceRepository);
    fleetRepo = module.get(FleetRepository);
  });

  describe('createSchedule', () => {
    it('should create a preventative maintenance schedule', async () => {
      fleetRepo.findVehicleById.mockResolvedValue(mockVehicle);
      maintRepo.createSchedule.mockResolvedValue(mockSchedule);

      const result = await service.createSchedule(
        {
          serviceName: 'Brake Inspection & Fluid Replacement',
          vehicleId: 'veh-1',
          intervalKm: 15000,
          intervalDays: 90,
          isActive: true,
        },
        mockUser,
      );

      expect(result.id).toBe('sched-1');
      expect(maintRepo.createSchedule).toHaveBeenCalled();
    });

    it('should reject if vehicle is not found', async () => {
      fleetRepo.findVehicleById.mockResolvedValue(null);

      await expect(
        service.createSchedule(
          {
            serviceName: 'Engine Overhaul',
            vehicleId: 'veh-999',
            intervalKm: 50000,
            intervalDays: 180,
            isActive: true,
          },
          mockUser,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getSchedules', () => {
    it('should retrieve schedules list', async () => {
      maintRepo.findSchedules.mockResolvedValue([mockSchedule]);

      const result = await service.getSchedules({}, mockUser);
      expect(result.length).toBe(1);
    });

    it('should get schedule by ID', async () => {
      maintRepo.findScheduleById.mockResolvedValue(mockSchedule);

      const result = await service.getScheduleById('sched-1', mockUser);
      expect(result.id).toBe('sched-1');
    });

    it('should reject non-existent schedule', async () => {
      maintRepo.findScheduleById.mockResolvedValue(null);

      await expect(service.getScheduleById('sched-999', mockUser)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('createRecord', () => {
    it('should create a maintenance work order record', async () => {
      fleetRepo.findVehicleById.mockResolvedValue(mockVehicle);
      maintRepo.createRecord.mockResolvedValue(mockRecord);

      const result = await service.createRecord(
        {
          vehicleId: 'veh-1',
          maintenanceType: 'SCHEDULED',
          scheduledDate: '2026-11-15',
          odometer: 15200.0,
          cost: 4500.0,
          currency: 'INR',
          vendor: 'Ashok Leyland Authorized Garage',
          description: 'Brake pad replacement and hydraulic check',
          technician: 'Ramesh Kumar',
        },
        mockUser,
      );

      expect(result.id).toBe('rec-1');
      expect(maintRepo.createRecord).toHaveBeenCalled();
    });
  });

  describe('updateRecordStatus', () => {
    it('should transition SCHEDULED to IN_PROGRESS and mark vehicle as MAINTENANCE', async () => {
      maintRepo.findRecordById.mockResolvedValue(mockRecord);
      fleetRepo.findVehicleById.mockResolvedValue(mockVehicle);
      maintRepo.updateRecordStatus.mockResolvedValue({
        ...mockRecord,
        status: 'IN_PROGRESS',
      });

      const result = await service.updateRecordStatus('rec-1', { status: 'IN_PROGRESS' }, mockUser);
      expect(result.status).toBe('IN_PROGRESS');
      expect(fleetRepo.updateVehicleStatus).toHaveBeenCalledWith(
        'veh-1',
        'MAINTENANCE',
        expect.anything(),
      );
      expect(fleetRepo.recordStatusHistory).toHaveBeenCalledWith(
        'veh-1',
        'ACTIVE',
        'MAINTENANCE',
        expect.stringContaining('started'),
        'user-fm-1',
        expect.anything(),
      );
    });

    it('should transition IN_PROGRESS to COMPLETED and return vehicle to ACTIVE', async () => {
      maintRepo.findRecordById.mockResolvedValue({
        ...mockRecord,
        status: 'IN_PROGRESS',
      });
      fleetRepo.findVehicleById.mockResolvedValue({
        ...mockVehicle,
        status: 'MAINTENANCE',
      });
      maintRepo.updateRecordStatus.mockResolvedValue({
        ...mockRecord,
        status: 'COMPLETED',
        completed_date: '2026-11-15',
      });

      const result = await service.updateRecordStatus('rec-1', { status: 'COMPLETED' }, mockUser);
      expect(result.status).toBe('COMPLETED');
      expect(fleetRepo.updateVehicleStatus).toHaveBeenCalledWith(
        'veh-1',
        'ACTIVE',
        expect.anything(),
      );
      expect(fleetRepo.recordStatusHistory).toHaveBeenCalledWith(
        'veh-1',
        'MAINTENANCE',
        'ACTIVE',
        expect.stringContaining('completed'),
        'user-fm-1',
        expect.anything(),
      );
    });

    it('should reject invalid transition from COMPLETED', async () => {
      maintRepo.findRecordById.mockResolvedValue({
        ...mockRecord,
        status: 'COMPLETED',
      });

      await expect(
        service.updateRecordStatus('rec-1', { status: 'IN_PROGRESS' }, mockUser),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('createInspection', () => {
    it('should record PASSED inspection and update odometer', async () => {
      fleetRepo.findVehicleById.mockResolvedValue(mockVehicle);
      maintRepo.createInspection.mockResolvedValue(mockInspection);

      const result = await service.createInspection(
        {
          vehicleId: 'veh-1',
          inspectionType: 'PRE_TRIP',
          status: 'PASSED',
          odometer: 15250.0,
          notes: 'All clear',
        },
        mockUser,
      );

      expect(result.status).toBe('PASSED');
      expect(fleetRepo.updateVehicleStatus).not.toHaveBeenCalled();
    });

    it('should mark vehicle as MAINTENANCE when inspection status is FAILED', async () => {
      fleetRepo.findVehicleById.mockResolvedValue(mockVehicle);
      maintRepo.createInspection.mockResolvedValue({
        ...mockInspection,
        status: 'FAILED',
      });

      const result = await service.createInspection(
        {
          vehicleId: 'veh-1',
          inspectionType: 'PRE_TRIP',
          status: 'FAILED',
          odometer: 15250.0,
          notes: 'Steering alignment defective',
        },
        mockUser,
      );

      expect(result.status).toBe('FAILED');
      expect(fleetRepo.updateVehicleStatus).toHaveBeenCalledWith(
        'veh-1',
        'MAINTENANCE',
        expect.anything(),
      );
      expect(fleetRepo.recordStatusHistory).toHaveBeenCalledWith(
        'veh-1',
        'ACTIVE',
        'MAINTENANCE',
        expect.stringContaining('failed'),
        'user-fm-1',
        expect.anything(),
      );
    });
  });

  describe('getInspections', () => {
    it('should query inspections list', async () => {
      maintRepo.findInspections.mockResolvedValue({
        inspections: [mockInspection],
        total: 1,
      });

      const result = await service.getInspections({ limit: 20, offset: 0 }, mockUser);
      expect(result.total).toBe(1);
    });

    it('should get inspection by ID', async () => {
      maintRepo.findInspectionById.mockResolvedValue(mockInspection);

      const result = await service.getInspectionById('insp-1', mockUser);
      expect(result.id).toBe('insp-1');
    });
  });
});
