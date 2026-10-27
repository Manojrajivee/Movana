import { Test, TestingModule } from '@nestjs/testing';
import { DriverOperationsController } from './driver-operations.controller';
import { DriverOperationsService } from '../services/driver-operations.service';

describe('DriverOperationsController', () => {
  let controller: DriverOperationsController;
  let service: jest.Mocked<DriverOperationsService>;

  const mockUser: any = {
    id: 'user-drv-1',
    roles: ['DRIVER'],
  };

  const mockAssignment: any = {
    id: '11111111-1111-4111-a111-111111111111',
    driver_id: '22222222-2222-4222-a222-222222222222',
    status: 'ACTIVE',
  };

  const mockSafetyEvent: any = {
    id: '33333333-3333-4333-a333-333333333333',
    driver_id: '22222222-2222-4222-a222-222222222222',
    vehicle_id: '44444444-4444-4444-a444-444444444444',
    event_type: 'OVERSPEED',
    severity: 'MEDIUM',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DriverOperationsController],
      providers: [
        {
          provide: DriverOperationsService,
          useValue: {
            startDuty: jest.fn().mockResolvedValue(mockAssignment),
            endDuty: jest.fn().mockResolvedValue({
              assignment: { ...mockAssignment, status: 'COMPLETED' },
              durationHours: 6.5,
              hoursExceeded: false,
            }),
            getCurrentDuty: jest.fn().mockResolvedValue(mockAssignment),
            getDutyHistory: jest.fn().mockResolvedValue({
              history: [mockAssignment],
              total: 1,
              summary: {
                driver_id: '22222222-2222-4222-a222-222222222222',
                hours_last_24h: 6.5,
                hours_last_7d: 35.0,
                total_completed_shifts: 5,
              },
            }),
            recordSafetyEvent: jest.fn().mockResolvedValue(mockSafetyEvent),
            getSafetyEvents: jest.fn().mockResolvedValue({ events: [mockSafetyEvent], total: 1 }),
          },
        },
      ],
    }).compile();

    controller = module.get<DriverOperationsController>(DriverOperationsController);
    service = module.get(DriverOperationsService);
  });

  it('should start duty', async () => {
    const body = { assignmentId: '11111111-1111-4111-a111-111111111111' };
    const res = await controller.startDuty(body, mockUser);
    expect(res.status).toBe('ACTIVE');
    expect(service.startDuty).toHaveBeenCalledWith(
      expect.objectContaining({ assignmentId: body.assignmentId }),
      mockUser,
    );
  });

  it('should end duty', async () => {
    const body = { assignmentId: '11111111-1111-4111-a111-111111111111' };
    const res = await controller.endDuty(body, mockUser);
    expect(res.assignment.status).toBe('COMPLETED');
    expect(res.durationHours).toBe(6.5);
    expect(service.endDuty).toHaveBeenCalled();
  });

  it('should get current duty', async () => {
    const res = await controller.getCurrentDuty(undefined, mockUser);
    expect(res?.status).toBe('ACTIVE');
  });

  it('should get duty history', async () => {
    const query = { limit: '20', offset: '0' };
    const res = await controller.getDutyHistory(query, mockUser);
    expect(res.total).toBe(1);
    expect(res.summary.hours_last_24h).toBe(6.5);
  });

  it('should record safety event', async () => {
    const body = {
      driverId: '22222222-2222-4222-a222-222222222222',
      vehicleId: '44444444-4444-4444-a444-444444444444',
      eventType: 'OVERSPEED',
      severity: 'MEDIUM',
    };
    const res = await controller.recordSafetyEvent(body, mockUser);
    expect(res.id).toBe('33333333-3333-4333-a333-333333333333');
  });

  it('should get safety events', async () => {
    const query = { severity: 'MEDIUM' };
    const res = await controller.getSafetyEvents(query, mockUser);
    expect(res.total).toBe(1);
  });
});
