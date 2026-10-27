import { Test, TestingModule } from '@nestjs/testing';
import { FleetOperationsController } from './fleet-operations.controller';
import { FleetOperationsService } from '../services/fleet-operations.service';

describe('FleetOperationsController', () => {
  let controller: FleetOperationsController;
  let service: jest.Mocked<FleetOperationsService>;

  const mockUser: any = {
    id: 'user-op-1',
    roles: ['OPERATOR'],
  };

  const mockAssignment: any = {
    id: '11111111-1111-4111-a111-111111111111',
    vehicle_id: '22222222-2222-4222-a222-222222222222',
    driver_id: '33333333-3333-4333-a333-333333333333',
    status: 'SCHEDULED',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FleetOperationsController],
      providers: [
        {
          provide: FleetOperationsService,
          useValue: {
            createAssignment: jest.fn().mockResolvedValue(mockAssignment),
            getAssignments: jest
              .fn()
              .mockResolvedValue({ assignments: [mockAssignment], total: 1 }),
            getAssignmentById: jest.fn().mockResolvedValue(mockAssignment),
            updateAssignmentStatus: jest
              .fn()
              .mockResolvedValue({ ...mockAssignment, status: 'ACTIVE' }),
            getVehicleReadiness: jest.fn().mockResolvedValue({
              vehicleId: '22222222-2222-4222-a222-222222222222',
              isReady: true,
              reasons: [],
            }),
            getVehicleStatusHistory: jest.fn().mockResolvedValue({ history: [], total: 0 }),
            getFleetSummary: jest.fn().mockResolvedValue({
              total_vehicles: 10,
              active_vehicles: 8,
              maintenance_vehicles: 1,
              reserved_vehicles: 1,
              decommissioned_vehicles: 0,
              active_assignments: 5,
            }),
          },
        },
      ],
    }).compile();

    controller = module.get<FleetOperationsController>(FleetOperationsController);
    service = module.get(FleetOperationsService);
  });

  it('should create vehicle assignment', async () => {
    const body = {
      vehicleId: '22222222-2222-4222-a222-222222222222',
      driverId: '33333333-3333-4333-a333-333333333333',
      assignmentType: 'TRIP',
      startAt: '2026-11-01T08:00:00Z',
    };
    const res = await controller.createAssignment(body, mockUser);
    expect(res).toEqual(mockAssignment);
    expect(service.createAssignment).toHaveBeenCalledWith(
      expect.objectContaining({ vehicleId: body.vehicleId }),
      mockUser,
    );
  });

  it('should query vehicle assignments', async () => {
    const query = { limit: '10', offset: '0' };
    const res = await controller.getAssignments(query, mockUser);
    expect(res.total).toBe(1);
    expect(service.getAssignments).toHaveBeenCalled();
  });

  it('should get assignment by ID', async () => {
    const res = await controller.getAssignmentById(
      '11111111-1111-4111-a111-111111111111',
      mockUser,
    );
    expect(res.id).toBe('11111111-1111-4111-a111-111111111111');
  });

  it('should update assignment status', async () => {
    const body = { status: 'ACTIVE' };
    const res = await controller.updateAssignmentStatus(
      '11111111-1111-4111-a111-111111111111',
      body,
      mockUser,
    );
    expect(res.status).toBe('ACTIVE');
  });

  it('should get vehicle readiness', async () => {
    const res = await controller.getVehicleReadiness(
      '22222222-2222-4222-a222-222222222222',
      mockUser,
    );
    expect(res.isReady).toBe(true);
  });

  it('should get vehicle status history', async () => {
    const res = await controller.getVehicleStatusHistory(
      '22222222-2222-4222-a222-222222222222',
      '10',
      '0',
      mockUser,
    );
    expect(res.total).toBe(0);
  });

  it('should get fleet summary', async () => {
    const res = await controller.getFleetSummary(mockUser);
    expect(res.total_vehicles).toBe(10);
  });
});
