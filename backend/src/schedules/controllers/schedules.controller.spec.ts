import { Test, TestingModule } from '@nestjs/testing';
import { SchedulesController } from './schedules.controller';
import { SchedulesService } from '../services/schedules.service';

describe('SchedulesController', () => {
  let controller: SchedulesController;
  let service: jest.Mocked<SchedulesService>;

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
  };

  const mockScheduleStop: any = {
    id: '55555555-5555-4555-a555-555555555555',
    schedule_id: scheduleId,
    stop_id: stopId,
    sequence_number: 1,
    scheduled_arrival_offset_minutes: 60,
    scheduled_departure_offset_minutes: 75,
  };

  beforeEach(async () => {
    const mockService = {
      createSchedule: jest.fn().mockResolvedValue(mockSchedule),
      getSchedules: jest.fn().mockResolvedValue({ items: [mockSchedule], total: 1 }),
      getScheduleSummary: jest.fn().mockResolvedValue({
        items: [
          {
            schedule_id: scheduleId,
            schedule_code: mockSchedule.schedule_code,
            route_code: 'DEL-JPR-EXP-01',
          },
        ],
        total: 1,
      }),
      getScheduleById: jest.fn().mockResolvedValue({
        ...mockSchedule,
        stops: [mockScheduleStop],
      }),
      updateSchedule: jest.fn().mockResolvedValue({
        ...mockSchedule,
        departure_time: '08:30:00',
      }),
      deleteSchedule: jest.fn().mockResolvedValue({
        ...mockSchedule,
        is_active: false,
      }),
      addScheduleStop: jest.fn().mockResolvedValue(mockScheduleStop),
      getScheduleStops: jest.fn().mockResolvedValue([mockScheduleStop]),
      updateScheduleStop: jest.fn().mockResolvedValue({
        ...mockScheduleStop,
        scheduled_arrival_offset_minutes: 65,
      }),
      deleteScheduleStop: jest.fn().mockResolvedValue(mockScheduleStop),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SchedulesController],
      providers: [{ provide: SchedulesService, useValue: mockService }],
    }).compile();

    controller = module.get<SchedulesController>(SchedulesController);
    service = module.get(SchedulesService);
  });

  it('creates trip schedule', async () => {
    const body = {
      scheduleCode: 'SCH-DEL-JPR-EXP-0800',
      routeId,
      serviceCalendarId,
      departureTime: '08:00:00',
      arrivalTime: '14:00:00',
    };
    const result = await controller.createSchedule(body);
    expect(result).toBeDefined();
    expect(service.createSchedule).toHaveBeenCalledWith(body);
  });

  it('lists trip schedules', async () => {
    const result = await controller.getSchedules({ limit: 10, offset: 0 });
    expect(result.items).toHaveLength(1);
    expect(service.getSchedules).toHaveBeenCalled();
  });

  it('gets schedule summary view', async () => {
    const result = await controller.getScheduleSummary('DEL-JPR', 'true', '10', '0');
    expect(result.items).toHaveLength(1);
    expect(service.getScheduleSummary).toHaveBeenCalledWith({
      routeCode: 'DEL-JPR',
      isActive: true,
      limit: 10,
      offset: 0,
    });
  });

  it('gets schedule by ID', async () => {
    const result = await controller.getScheduleById(scheduleId);
    expect(result.id).toBe(scheduleId);
    expect(service.getScheduleById).toHaveBeenCalledWith(scheduleId);
  });

  it('updates schedule', async () => {
    const body = { departureTime: '08:30:00' };
    const result = await controller.updateSchedule(scheduleId, body);
    expect(result.departure_time).toBe('08:30:00');
    expect(service.updateSchedule).toHaveBeenCalledWith(scheduleId, body);
  });

  it('deactivates schedule', async () => {
    const result = await controller.deleteSchedule(scheduleId);
    expect(result.is_active).toBe(false);
    expect(service.deleteSchedule).toHaveBeenCalledWith(scheduleId);
  });

  it('adds stop to schedule', async () => {
    const body = {
      stopId,
      sequenceNumber: 1,
      scheduledArrivalOffsetMinutes: 60,
      scheduledDepartureOffsetMinutes: 75,
    };
    const result = await controller.addScheduleStop(scheduleId, body);
    expect(result).toBeDefined();
    expect(service.addScheduleStop).toHaveBeenCalledWith(scheduleId, body);
  });

  it('gets intermediate stops for schedule', async () => {
    const result = await controller.getScheduleStops(scheduleId);
    expect(result).toHaveLength(1);
    expect(service.getScheduleStops).toHaveBeenCalledWith(scheduleId);
  });

  it('updates intermediate stop timing offset', async () => {
    const body = { scheduledArrivalOffsetMinutes: 65 };
    const result = await controller.updateScheduleStop(scheduleId, stopId, body);
    expect(result.scheduled_arrival_offset_minutes).toBe(65);
    expect(service.updateScheduleStop).toHaveBeenCalledWith(scheduleId, stopId, body);
  });

  it('deletes intermediate stop from schedule', async () => {
    const result = await controller.deleteScheduleStop(scheduleId, stopId);
    expect(result).toBeDefined();
    expect(service.deleteScheduleStop).toHaveBeenCalledWith(scheduleId, stopId);
  });
});
