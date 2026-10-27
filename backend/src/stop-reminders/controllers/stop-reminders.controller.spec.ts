import { Test, TestingModule } from '@nestjs/testing';
import { StopRemindersController } from './stop-reminders.controller';
import { StopRemindersService } from '../services/stop-reminders.service';

describe('StopRemindersController', () => {
  let controller: StopRemindersController;
  let service: jest.Mocked<StopRemindersService>;

  const mockUser: any = {
    id: '11111111-1111-4111-a111-111111111111',
    email: 'passenger@example.com',
    roles: ['PASSENGER'],
    permissions: [],
  };

  const tripId = '22222222-2222-4222-a222-222222222222';
  const stopId = '33333333-3333-4333-a333-333333333333';
  const reminderId = '44444444-4444-4444-a444-444444444444';

  beforeEach(async () => {
    const mockService: Partial<jest.Mocked<StopRemindersService>> = {
      createReminder: jest.fn(),
      getUserReminders: jest.fn(),
      getReminderById: jest.fn(),
      deleteReminder: jest.fn(),
      evaluateTripReminders: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StopRemindersController],
      providers: [
        {
          provide: StopRemindersService,
          useValue: mockService,
        },
      ],
    }).compile();

    controller = module.get<StopRemindersController>(StopRemindersController);
    service = module.get(StopRemindersService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should delegate createReminder to service', async () => {
    const payload = {
      tripId,
      targetStopId: stopId,
      reminderType: 'STOPS_BEFORE',
      reminderValue: 1,
      notifyChannel: 'IN_APP',
    };
    service.createReminder.mockResolvedValue({ id: reminderId } as any);

    const res = await controller.createReminder(payload, mockUser);
    expect(res.id).toBe(reminderId);
    expect(service.createReminder).toHaveBeenCalledWith(
      expect.objectContaining({ tripId, targetStopId: stopId }),
      mockUser,
    );
  });

  it('should delegate getMyReminders to service', async () => {
    service.getUserReminders.mockResolvedValue([{ id: reminderId } as any]);

    const res = await controller.getMyReminders(mockUser);
    expect(res).toHaveLength(1);
    expect(service.getUserReminders).toHaveBeenCalledWith(mockUser.id);
  });

  it('should delegate getReminderById to service', async () => {
    service.getReminderById.mockResolvedValue({ id: reminderId } as any);

    const res = await controller.getReminderById(reminderId, mockUser);
    expect(res.id).toBe(reminderId);
    expect(service.getReminderById).toHaveBeenCalledWith(reminderId, mockUser);
  });

  it('should delegate deleteReminder to service', async () => {
    service.deleteReminder.mockResolvedValue({ success: true, message: 'Cancelled' });

    const res = await controller.deleteReminder(reminderId, mockUser);
    expect(res.success).toBe(true);
    expect(service.deleteReminder).toHaveBeenCalledWith(reminderId, mockUser);
  });

  it('should delegate evaluateTripReminders to service', async () => {
    service.evaluateTripReminders.mockResolvedValue({
      evaluatedCount: 2,
      triggeredCount: 1,
      alarms: [],
    });

    const res = await controller.evaluateTripReminders(tripId);
    expect(res.evaluatedCount).toBe(2);
    expect(service.evaluateTripReminders).toHaveBeenCalledWith(tripId);
  });
});
