import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { StopRemindersService } from './stop-reminders.service';
import { StopRemindersRepository } from '../repositories/stop-reminders.repository';

describe('StopRemindersService', () => {
  let service: StopRemindersService;
  let repo: jest.Mocked<StopRemindersRepository>;

  const mockUser: any = {
    id: 'user-1',
    email: 'passenger@example.com',
    roles: ['PASSENGER'],
  };

  const mockAdmin: any = {
    id: 'admin-1',
    email: 'admin@movana.internal',
    roles: ['ADMIN'],
  };

  const mockTrip = {
    id: 'trip-1',
    trip_number: 'TRIP-101',
    status: 'IN_TRANSIT',
    current_stop_id: 'stop-1',
  };

  const mockTargetStop = {
    id: 'ts-2',
    trip_id: 'trip-1',
    stop_id: 'stop-2',
    sequence_number: 2,
    stop_name: 'Gurgaon Cyber Hub',
    scheduled_arrival_at: new Date(Date.now() + 10 * 60000),
    status: 'PENDING',
  };

  const getMockReminder = () => ({
    id: 'rem-1',
    userId: 'user-1',
    tripId: 'trip-1',
    tripNumber: 'TRIP-101',
    targetStopId: 'stop-2',
    targetStopName: 'Gurgaon Cyber Hub',
    targetSequenceNumber: 2,
    reminderType: 'STOPS_BEFORE' as const,
    reminderValue: 1,
    notifyChannel: 'IN_APP' as const,
    isTriggered: false,
    triggeredAt: null,
    createdAt: new Date(),
  });

  beforeEach(async () => {
    const mockRepo: Partial<jest.Mocked<StopRemindersRepository>> = {
      findTripInfo: jest.fn(),
      findTripStop: jest.fn(),
      findAllTripStops: jest.fn(),
      saveReminder: jest.fn(),
      findReminderById: jest.fn(),
      findUserReminders: jest.fn(),
      findTripReminders: jest.fn(),
      deleteReminder: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StopRemindersService,
        {
          provide: StopRemindersRepository,
          useValue: mockRepo,
        },
      ],
    }).compile();

    service = module.get<StopRemindersService>(StopRemindersService);
    repo = module.get(StopRemindersRepository);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createReminder', () => {
    it('should throw NotFoundException if trip not found', async () => {
      repo.findTripInfo.mockResolvedValue(null);

      await expect(
        service.createReminder(
          {
            tripId: 'trip-999',
            targetStopId: 'stop-2',
            reminderType: 'STOPS_BEFORE',
            reminderValue: 1,
            notifyChannel: 'IN_APP',
          },
          mockUser,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if trip is completed or cancelled', async () => {
      repo.findTripInfo.mockResolvedValue({
        ...mockTrip,
        status: 'COMPLETED',
      } as any);

      await expect(
        service.createReminder(
          {
            tripId: 'trip-1',
            targetStopId: 'stop-2',
            reminderType: 'STOPS_BEFORE',
            reminderValue: 1,
            notifyChannel: 'IN_APP',
          },
          mockUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if target stop not in trip', async () => {
      repo.findTripInfo.mockResolvedValue(mockTrip as any);
      repo.findTripStop.mockResolvedValue(null);

      await expect(
        service.createReminder(
          {
            tripId: 'trip-1',
            targetStopId: 'stop-999',
            reminderType: 'STOPS_BEFORE',
            reminderValue: 1,
            notifyChannel: 'IN_APP',
          },
          mockUser,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException if duplicate active reminder exists', async () => {
      repo.findTripInfo.mockResolvedValue(mockTrip as any);
      repo.findTripStop.mockResolvedValue(mockTargetStop as any);
      repo.findUserReminders.mockResolvedValue([getMockReminder()]);

      await expect(
        service.createReminder(
          {
            tripId: 'trip-1',
            targetStopId: 'stop-2',
            reminderType: 'STOPS_BEFORE',
            reminderValue: 1,
            notifyChannel: 'IN_APP',
          },
          mockUser,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('should create and save reminder successfully', async () => {
      repo.findTripInfo.mockResolvedValue(mockTrip as any);
      repo.findTripStop.mockResolvedValue(mockTargetStop as any);
      repo.findUserReminders.mockResolvedValue([]);
      repo.saveReminder.mockResolvedValue(undefined);

      const res = await service.createReminder(
        {
          tripId: 'trip-1',
          targetStopId: 'stop-2',
          reminderType: 'STOPS_BEFORE',
          reminderValue: 1,
          notifyChannel: 'IN_APP',
        },
        mockUser,
      );

      expect(res.id).toBeDefined();
      expect(res.targetStopName).toBe('Gurgaon Cyber Hub');
      expect(repo.saveReminder).toHaveBeenCalled();
    });
  });

  describe('getReminderById', () => {
    it('should throw NotFoundException if reminder not found', async () => {
      repo.findReminderById.mockResolvedValue(null);

      await expect(service.getReminderById('rem-999', mockUser)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user does not own reminder and is not admin', async () => {
      repo.findReminderById.mockResolvedValue(getMockReminder());

      await expect(
        service.getReminderById('rem-1', { id: 'other-user', roles: ['PASSENGER'] } as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should return reminder for owner', async () => {
      repo.findReminderById.mockResolvedValue(getMockReminder());

      const res = await service.getReminderById('rem-1', mockUser);
      expect(res.id).toBe('rem-1');
    });

    it('should allow admin to view any reminder', async () => {
      repo.findReminderById.mockResolvedValue(getMockReminder());

      const res = await service.getReminderById('rem-1', mockAdmin);
      expect(res.id).toBe('rem-1');
    });
  });

  describe('deleteReminder', () => {
    it('should throw ForbiddenException if user is not owner or admin', async () => {
      repo.findReminderById.mockResolvedValue(getMockReminder());

      await expect(
        service.deleteReminder('rem-1', { id: 'other-user', roles: ['PASSENGER'] } as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should delete reminder successfully', async () => {
      repo.findReminderById.mockResolvedValue(getMockReminder());
      repo.deleteReminder.mockResolvedValue(undefined);

      const res = await service.deleteReminder('rem-1', mockUser);
      expect(res.success).toBe(true);
      expect(repo.deleteReminder).toHaveBeenCalledWith('rem-1', 'user-1', 'trip-1');
    });
  });

  describe('evaluateTripReminders', () => {
    it('should evaluate STOPS_BEFORE alarm and trigger notification', async () => {
      repo.findTripInfo.mockResolvedValue(mockTrip as any);
      repo.findTripReminders.mockResolvedValue([getMockReminder()]);
      repo.findAllTripStops.mockResolvedValue([
        { stop_id: 'stop-1', sequence_number: 1, status: 'ARRIVED' },
        { stop_id: 'stop-2', sequence_number: 2, status: 'PENDING' },
      ]);
      repo.saveReminder.mockResolvedValue(undefined);

      const res = await service.evaluateTripReminders('trip-1');
      expect(res.evaluatedCount).toBe(1);
      expect(res.triggeredCount).toBe(1);
      expect(res.alarms[0].reminderId).toBe('rem-1');
      expect(res.alarms[0].alertMessage).toContain('Gurgaon Cyber Hub is 1 stop(s) away');
      expect(repo.saveReminder).toHaveBeenCalled();
    });

    it('should evaluate ON_ARRIVAL alarm when target stop is ARRIVED', async () => {
      repo.findTripInfo.mockResolvedValue(mockTrip as any);
      repo.findTripReminders.mockResolvedValue([
        {
          ...getMockReminder(),
          reminderType: 'ON_ARRIVAL',
          reminderValue: 0,
        },
      ]);
      repo.findAllTripStops.mockResolvedValue([
        { stop_id: 'stop-1', sequence_number: 1, status: 'DEPARTED' },
        { stop_id: 'stop-2', sequence_number: 2, status: 'ARRIVED' },
      ]);
      repo.saveReminder.mockResolvedValue(undefined);

      const res = await service.evaluateTripReminders('trip-1');
      expect(res.triggeredCount).toBe(1);
      expect(res.alarms[0].alertMessage).toContain('You have arrived at your destination stop');
    });
  });
});
