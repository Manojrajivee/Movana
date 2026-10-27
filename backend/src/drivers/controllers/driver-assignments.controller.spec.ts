import { Test, TestingModule } from '@nestjs/testing';
import { DriverAssignmentsController } from './driver-assignments.controller';
import { DriverAssignmentsService } from '../services/driver-assignments.service';
import { AuthenticatedUser } from '../../auth/decorators/current-user.decorator';

describe('DriverAssignmentsController', () => {
  let controller: DriverAssignmentsController;
  let mockService: any;

  const mockUser: AuthenticatedUser = {
    id: '11111111-1111-4111-a111-111111111111',
    email: 'operator@movana.internal',
    roles: ['OPERATOR'],
    permissions: [],
  };

  const mockAssignment: any = {
    id: '66666666-6666-4666-a666-666666666666',
    driver_id: '55555555-5555-4555-a555-555555555555',
    vehicle_id: '77777777-7777-4777-a777-777777777777',
    trip_id: null,
    assignment_type: 'REGULAR_SHIFT',
    start_at: new Date('2026-11-01T08:00:00Z'),
    end_at: new Date('2026-11-01T16:00:00Z'),
    status: 'SCHEDULED',
    assigned_by: mockUser.id,
    created_at: new Date(),
    updated_at: new Date(),
  };

  beforeEach(async () => {
    mockService = {
      createAssignment: jest.fn(),
      getAssignments: jest.fn(),
      getAssignmentById: jest.fn(),
      updateAssignmentStatus: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DriverAssignmentsController],
      providers: [{ provide: DriverAssignmentsService, useValue: mockService }],
    }).compile();

    controller = module.get<DriverAssignmentsController>(DriverAssignmentsController);
  });

  it('should create an assignment', async () => {
    mockService.createAssignment.mockResolvedValue(mockAssignment);

    const dto = {
      driverId: '55555555-5555-4555-a555-555555555555',
      startAt: '2026-11-01T08:00:00.000Z',
      assignmentType: 'REGULAR_SHIFT' as const,
    };

    const res = await controller.createAssignment(dto, mockUser);
    expect(res).toEqual(mockAssignment);
    expect(mockService.createAssignment).toHaveBeenCalledWith(
      expect.objectContaining({ driverId: dto.driverId }),
      mockUser,
    );
  });

  it('should list assignments', async () => {
    mockService.getAssignments.mockResolvedValue({
      assignments: [mockAssignment],
      total: 1,
    });

    const res = await controller.getAssignments({ limit: 10, offset: 0 }, mockUser);
    expect(res.assignments).toHaveLength(1);
    expect(res.total).toBe(1);
  });

  it('should get assignment by ID', async () => {
    mockService.getAssignmentById.mockResolvedValue(mockAssignment);

    const res = await controller.getAssignmentById(mockAssignment.id, mockUser);
    expect(res).toEqual(mockAssignment);
  });

  it('should update assignment status', async () => {
    mockService.updateAssignmentStatus.mockResolvedValue({
      ...mockAssignment,
      status: 'ACTIVE',
    });

    const res = await controller.updateAssignmentStatus(
      mockAssignment.id,
      { status: 'ACTIVE' },
      mockUser,
    );
    expect(res.status).toBe('ACTIVE');
  });
});
