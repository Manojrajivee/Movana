import { Test, TestingModule } from '@nestjs/testing';
import { TransportFoundationController } from './transport-foundation.controller';
import { TransportFoundationService } from '../services/transport-foundation.service';

describe('TransportFoundationController', () => {
  let controller: TransportFoundationController;
  let service: jest.Mocked<TransportFoundationService>;

  const mockCalendar: any = {
    id: '11111111-1111-4111-a111-111111111111',
    calendar_name: 'Regular Weekday & Saturday Service 2026-2027',
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    monday: true,
    tuesday: true,
    wednesday: true,
    thursday: true,
    friday: true,
    saturday: true,
    sunday: false,
    exceptions: [],
  };

  const mockException: any = {
    id: '22222222-2222-4222-a222-222222222222',
    service_calendar_id: '11111111-1111-4111-a111-111111111111',
    exception_date: '2026-08-15',
    exception_type: 'REMOVED',
    description: 'Independence Day',
  };

  beforeEach(async () => {
    const mockService = {
      createCalendar: jest.fn().mockResolvedValue(mockCalendar),
      getCalendarById: jest.fn().mockResolvedValue(mockCalendar),
      getCalendars: jest.fn().mockResolvedValue({
        calendars: [mockCalendar],
        total: 1,
        limit: 20,
        offset: 0,
      }),
      updateCalendar: jest.fn().mockResolvedValue({
        ...mockCalendar,
        calendar_name: 'Updated Calendar',
      }),
      deleteCalendar: jest.fn().mockResolvedValue({ deleted: true }),
      createException: jest.fn().mockResolvedValue(mockException),
      getExceptions: jest.fn().mockResolvedValue([mockException]),
      deleteException: jest.fn().mockResolvedValue({ deleted: true }),
      isCalendarActiveOnDate: jest.fn().mockResolvedValue({
        calendarId: mockCalendar.id,
        date: '2026-08-15',
        isActive: false,
        reason: 'Service cancelled by calendar exception',
      }),
      getTransitModes: jest.fn().mockReturnValue([
        { mode: 'BUS', name: 'City Bus' },
        { mode: 'METRO', name: 'Urban Metro' },
      ]),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TransportFoundationController],
      providers: [{ provide: TransportFoundationService, useValue: mockService }],
    }).compile();

    controller = module.get<TransportFoundationController>(TransportFoundationController);
    service = module.get(TransportFoundationService);
  });

  it('should get transit modes', () => {
    const modes = controller.getTransitModes();
    expect(modes).toHaveLength(2);
    expect(service.getTransitModes).toHaveBeenCalled();
  });

  it('should create calendar', async () => {
    const res = await controller.createCalendar({
      calendarName: 'Regular Weekday & Saturday Service 2026-2027',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
    });
    expect(res.id).toBe(mockCalendar.id);
    expect(service.createCalendar).toHaveBeenCalled();
  });

  it('should list calendars', async () => {
    const res = await controller.getCalendars({});
    expect(res.calendars).toHaveLength(1);
    expect(service.getCalendars).toHaveBeenCalled();
  });

  it('should get calendar by ID', async () => {
    const res = await controller.getCalendarById('11111111-1111-4111-a111-111111111111');
    expect(res.id).toBe(mockCalendar.id);
  });

  it('should update calendar', async () => {
    const res = await controller.updateCalendar('11111111-1111-4111-a111-111111111111', {
      calendarName: 'Updated Calendar',
    });
    expect(res.calendar_name).toBe('Updated Calendar');
  });

  it('should delete calendar', async () => {
    const res = await controller.deleteCalendar('11111111-1111-4111-a111-111111111111');
    expect(res.deleted).toBe(true);
  });

  it('should add calendar exception', async () => {
    const res = await controller.createException('11111111-1111-4111-a111-111111111111', {
      exceptionDate: '2026-08-15',
      exceptionType: 'REMOVED',
    });
    expect(res.id).toBe(mockException.id);
  });

  it('should get calendar exceptions', async () => {
    const res = await controller.getExceptions('11111111-1111-4111-a111-111111111111');
    expect(res).toHaveLength(1);
  });

  it('should delete calendar exception', async () => {
    const res = await controller.deleteException(
      '11111111-1111-4111-a111-111111111111',
      '22222222-2222-4222-a222-222222222222',
    );
    expect(res.deleted).toBe(true);
  });

  it('should check if calendar is active on date', async () => {
    const res = await controller.isCalendarActiveOnDate(
      '11111111-1111-4111-a111-111111111111',
      '2026-08-15',
    );
    expect(res.isActive).toBe(false);
  });
});
