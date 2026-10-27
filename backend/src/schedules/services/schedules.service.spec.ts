import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../../database/database.service';
import { SchedulesRepository } from '../repositories/schedules.repository';
import { SchedulesService } from './schedules.service';

describe('SchedulesService', () => {
  let service: SchedulesService;
  let repo: jest.Mocked<SchedulesRepository>;

  const scheduleId = '11111111-1111-4111-a111-111111111111';
  const routeId = '22222222-2222-4222-a222-222222222222';
  const serviceCalendarId = '33333333-3333-4333-a333-333333333333';
  const stopId = '44444444-4444-4444-a444-444444444444';

  const mockSchedule: any = {
    id: scheduleId,
    schedule_code: 'SCH-DEL-JPR-EXP-0800',
    route_id: routeId,
    service_calendar_id: serviceCalendarId,
    departure_time: '08:00:00',
    arrival_time: '14:00:00',
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const mockScheduleStop: any = {
    id: '55555555-5555-4555-a555-555555555555',
    schedule_id: scheduleId,
    stop_id: stopId,
    sequence_number: 1,
    scheduled_arrival_offset_minutes: 60,
    scheduled_departure_offset_minutes: 75,
    created_at: new Date(),
    updated_at: new Date(),
    stop_name: 'Gurugram IFFCO Chowk',
    stop_code: 'GGN-IFFCO-01',
    city: 'Gurugram',
  };

  beforeEach(async () => {
    const mockRepo = {
      createSchedule: jest.fn().mockResolvedValue(mockSchedule),
      findByCode: jest.fn().mockImplementation((code: string) => {
        if (code === mockSchedule.schedule_code) return Promise.resolve(mockSchedule);
        return Promise.resolve(null);
      }),
      findById: jest.fn().mockImplementation((id: string) => {
        if (id === scheduleId) return Promise.resolve(mockSchedule);
        return Promise.resolve(null);
      }),
      findAll: jest.fn().mockResolvedValue({
        items: [mockSchedule],
        total: 1,
      }),
      findScheduleSummary: jest.fn().mockResolvedValue({
        items: [
          {
            schedule_id: scheduleId,
            schedule_code: mockSchedule.schedule_code,
            route_code: 'DEL-JPR-EXP-01',
            route_name: 'Delhi to Jaipur Express',
            departure_time: '08:00:00',
            arrival_time: '14:00:00',
            is_active: true,
            operating_days: 'Mon, Tue, Wed, Thu, Fri',
            intermediate_stops_count: 3,
          },
        ],
        total: 1,
      }),
      updateSchedule: jest.fn().mockResolvedValue({
        ...mockSchedule,
        departure_time: '08:30:00',
      }),
      deactivateSchedule: jest.fn().mockResolvedValue({
        ...mockSchedule,
        is_active: false,
      }),
      checkRouteActive: jest.fn().mockImplementation((id: string) => {
        return Promise.resolve(id === routeId);
      }),
      checkCalendarExists: jest.fn().mockImplementation((id: string) => {
        return Promise.resolve(id === serviceCalendarId);
      }),
      checkStopExists: jest.fn().mockImplementation((id: string) => {
        return Promise.resolve(id === stopId);
      }),
      findRouteStopsForRoute: jest.fn().mockResolvedValue([
        {
          stop_id: stopId,
          sequence_number: 1,
          arrival_offset_minutes: 60,
          departure_offset_minutes: 75,
        },
      ]),
      findScheduleStops: jest.fn().mockResolvedValue([mockScheduleStop]),
      findScheduleStop: jest.fn().mockImplementation((sId: string, stId: string) => {
        if (sId === scheduleId && stId === stopId) return Promise.resolve(mockScheduleStop);
        return Promise.resolve(null);
      }),
      addScheduleStop: jest.fn().mockResolvedValue(mockScheduleStop),
      updateScheduleStop: jest.fn().mockResolvedValue({
        ...mockScheduleStop,
        scheduled_arrival_offset_minutes: 65,
        scheduled_departure_offset_minutes: 80,
      }),
      deleteScheduleStop: jest.fn().mockResolvedValue(mockScheduleStop),
    };

    const mockDb = {
      withTransaction: jest.fn().mockImplementation(async (cb) => {
        return cb({});
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SchedulesService,
        { provide: SchedulesRepository, useValue: mockRepo },
        { provide: DatabaseService, useValue: mockDb },
      ],
    }).compile();

    service = module.get<SchedulesService>(SchedulesService);
    repo = module.get(SchedulesRepository);
  });

  describe('createSchedule', () => {
    it('creates a new schedule and populates intermediate stops from route alignment', async () => {
      const result = await service.createSchedule({
        scheduleCode: 'SCH-NEW-01',
        routeId,
        serviceCalendarId,
        departureTime: '09:00:00',
        arrivalTime: '15:00:00',
        isActive: true,
      });

      expect(result).toBeDefined();
      expect(repo.createSchedule).toHaveBeenCalled();
      expect(repo.addScheduleStop).toHaveBeenCalledWith(
        expect.objectContaining({
          scheduleId: mockSchedule.id,
          stopId,
          sequenceNumber: 1,
        }),
        expect.anything(),
      );
    });

    it('throws ConflictException if scheduleCode already exists', async () => {
      await expect(
        service.createSchedule({
          scheduleCode: mockSchedule.schedule_code,
          routeId,
          serviceCalendarId,
          departureTime: '08:00:00',
          arrivalTime: '14:00:00',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('throws NotFoundException if route is missing or inactive', async () => {
      await expect(
        service.createSchedule({
          scheduleCode: 'SCH-UNIQUE-02',
          routeId: '99999999-9999-4999-a999-999999999999',
          serviceCalendarId,
          departureTime: '08:00:00',
          arrivalTime: '14:00:00',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException if service calendar is missing', async () => {
      await expect(
        service.createSchedule({
          scheduleCode: 'SCH-UNIQUE-03',
          routeId,
          serviceCalendarId: '99999999-9999-4999-a999-999999999999',
          departureTime: '08:00:00',
          arrivalTime: '14:00:00',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getSchedules', () => {
    it('queries trip schedules with filtering parameters', async () => {
      const result = await service.getSchedules({
        limit: 10,
        offset: 0,
      });

      expect(result).toBeDefined();
      expect(repo.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 10,
          offset: 0,
        }),
      );
    });
  });

  describe('getScheduleSummary', () => {
    it('returns timetable summary from view', async () => {
      const result = await service.getScheduleSummary({
        limit: 10,
        offset: 0,
      });

      expect(result.items).toHaveLength(1);
      expect(repo.findScheduleSummary).toHaveBeenCalled();
    });
  });

  describe('getScheduleById', () => {
    it('returns schedule along with its intermediate stops', async () => {
      const result = await service.getScheduleById(scheduleId);

      expect(result).toBeDefined();
      expect(result.id).toBe(scheduleId);
      expect(result.stops).toHaveLength(1);
      expect(repo.findScheduleStops).toHaveBeenCalledWith(scheduleId);
    });

    it('throws NotFoundException if schedule does not exist', async () => {
      await expect(service.getScheduleById('99999999-9999-4999-a999-999999999999')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateSchedule', () => {
    it('updates departure/arrival times', async () => {
      const result = await service.updateSchedule(scheduleId, {
        departureTime: '08:30:00',
      });

      expect(result.departure_time).toBe('08:30:00');
      expect(repo.updateSchedule).toHaveBeenCalledWith(scheduleId, {
        departureTime: '08:30:00',
      });
    });

    it('throws NotFoundException if updating non-existent calendar', async () => {
      await expect(
        service.updateSchedule(scheduleId, {
          serviceCalendarId: '99999999-9999-4999-a999-999999999999',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException if schedule does not exist', async () => {
      await expect(
        service.updateSchedule('99999999-9999-4999-a999-999999999999', {
          departureTime: '10:00:00',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteSchedule', () => {
    it('deactivates schedule successfully', async () => {
      const result = await service.deleteSchedule(scheduleId);
      expect(result.is_active).toBe(false);
      expect(repo.deactivateSchedule).toHaveBeenCalledWith(scheduleId);
    });

    it('throws NotFoundException if schedule not found', async () => {
      await expect(service.deleteSchedule('99999999-9999-4999-a999-999999999999')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('addScheduleStop', () => {
    it('adds an intermediate stop offset to schedule', async () => {
      const newStopId = '66666666-6666-4666-a666-666666666666';
      (repo.checkStopExists as jest.Mock).mockResolvedValueOnce(true);
      (repo.findScheduleStop as jest.Mock).mockResolvedValueOnce(null);

      const result = await service.addScheduleStop(scheduleId, {
        stopId: newStopId,
        sequenceNumber: 2,
        scheduledArrivalOffsetMinutes: 120,
        scheduledDepartureOffsetMinutes: 130,
      });

      expect(result).toBeDefined();
      expect(repo.addScheduleStop).toHaveBeenCalledWith(
        expect.objectContaining({
          scheduleId,
          stopId: newStopId,
          sequenceNumber: 2,
          scheduledArrivalOffsetMinutes: 120,
          scheduledDepartureOffsetMinutes: 130,
        }),
      );
    });

    it('throws NotFoundException if stop does not exist', async () => {
      await expect(
        service.addScheduleStop(scheduleId, {
          stopId: '99999999-9999-4999-a999-999999999999',
          sequenceNumber: 2,
          scheduledArrivalOffsetMinutes: 120,
          scheduledDepartureOffsetMinutes: 130,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException if stop already exists on schedule', async () => {
      await expect(
        service.addScheduleStop(scheduleId, {
          stopId,
          sequenceNumber: 1,
          scheduledArrivalOffsetMinutes: 60,
          scheduledDepartureOffsetMinutes: 75,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('updateScheduleStop', () => {
    it('updates arrival and departure offset minutes', async () => {
      const result = await service.updateScheduleStop(scheduleId, stopId, {
        scheduledArrivalOffsetMinutes: 65,
        scheduledDepartureOffsetMinutes: 80,
      });

      expect(result.scheduled_arrival_offset_minutes).toBe(65);
      expect(repo.updateScheduleStop).toHaveBeenCalledWith(scheduleId, stopId, {
        scheduledArrivalOffsetMinutes: 65,
        scheduledDepartureOffsetMinutes: 80,
      });
    });

    it('throws BadRequestException if departure offset is before arrival offset', async () => {
      await expect(
        service.updateScheduleStop(scheduleId, stopId, {
          scheduledArrivalOffsetMinutes: 90,
          scheduledDepartureOffsetMinutes: 80,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException if stop is not on schedule', async () => {
      await expect(
        service.updateScheduleStop(scheduleId, '99999999-9999-4999-a999-999999999999', {
          scheduledArrivalOffsetMinutes: 65,
          scheduledDepartureOffsetMinutes: 80,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteScheduleStop', () => {
    it('removes stop from schedule', async () => {
      const result = await service.deleteScheduleStop(scheduleId, stopId);
      expect(result).toBeDefined();
      expect(repo.deleteScheduleStop).toHaveBeenCalledWith(scheduleId, stopId);
    });

    it('throws NotFoundException if stop is not on schedule', async () => {
      await expect(
        service.deleteScheduleStop(scheduleId, '99999999-9999-4999-a999-999999999999'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
