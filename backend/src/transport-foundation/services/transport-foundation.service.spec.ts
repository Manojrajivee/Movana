import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TransportFoundationRepository } from '../repositories/transport-foundation.repository';
import { TransportFoundationService } from './transport-foundation.service';

describe('TransportFoundationService', () => {
  let service: TransportFoundationService;
  let repo: jest.Mocked<TransportFoundationRepository>;

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
    created_at: new Date(),
    updated_at: new Date(),
    exceptions_count: 1,
  };

  const mockException: any = {
    id: '22222222-2222-4222-a222-222222222222',
    service_calendar_id: '11111111-1111-4111-a111-111111111111',
    exception_date: '2026-08-15',
    exception_type: 'REMOVED',
    description: 'Independence Day Holiday',
    created_at: new Date(),
  };

  beforeEach(async () => {
    const mockRepo = {
      createCalendar: jest.fn().mockResolvedValue(mockCalendar),
      findCalendarById: jest.fn().mockImplementation((id: string) => {
        if (id === mockCalendar.id) return Promise.resolve(mockCalendar);
        return Promise.resolve(null);
      }),
      findCalendars: jest.fn().mockResolvedValue({
        calendars: [mockCalendar],
        total: 1,
      }),
      updateCalendar: jest.fn().mockResolvedValue({
        ...mockCalendar,
        calendar_name: 'Updated Service Schedule',
      }),
      deleteCalendar: jest.fn().mockResolvedValue(true),
      createException: jest.fn().mockResolvedValue(mockException),
      findExceptionsByCalendarId: jest.fn().mockResolvedValue([mockException]),
      findExceptionById: jest.fn().mockImplementation((id: string) => {
        if (id === mockException.id) return Promise.resolve(mockException);
        return Promise.resolve(null);
      }),
      findExceptionByCalendarAndDate: jest
        .fn()
        .mockImplementation((_calId: string, date: string) => {
          if (date === '2026-08-15') return Promise.resolve(mockException);
          return Promise.resolve(null);
        }),
      deleteException: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransportFoundationService,
        { provide: TransportFoundationRepository, useValue: mockRepo },
      ],
    }).compile();

    service = module.get<TransportFoundationService>(TransportFoundationService);
    repo = module.get(TransportFoundationRepository);
  });

  describe('createCalendar', () => {
    it('should create calendar when dates are valid', async () => {
      const result = await service.createCalendar({
        calendarName: 'Regular Weekday & Saturday Service 2026-2027',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        monday: true,
        tuesday: true,
        wednesday: true,
        thursday: true,
        friday: true,
        saturday: true,
        sunday: false,
      });

      expect(result).toBeDefined();
      expect(repo.createCalendar).toHaveBeenCalled();
    });

    it('should reject calendar creation if endDate is before startDate', async () => {
      await expect(
        service.createCalendar({
          calendarName: 'Invalid Calendar',
          startDate: '2026-12-31',
          endDate: '2026-01-01',
          monday: true,
          tuesday: true,
          wednesday: true,
          thursday: true,
          friday: true,
          saturday: true,
          sunday: true,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getCalendarById', () => {
    it('should return calendar with exceptions', async () => {
      const result = await service.getCalendarById(mockCalendar.id);
      expect(result.id).toBe(mockCalendar.id);
      expect(result.exceptions).toHaveLength(1);
    });

    it('should throw NotFoundException when calendar does not exist', async () => {
      await expect(service.getCalendarById('00000000-0000-0000-0000-000000000000')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getCalendars', () => {
    it('should query calendars with pagination', async () => {
      const result = await service.getCalendars({ limit: 10, offset: 0 });
      expect(result.calendars).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });

  describe('updateCalendar', () => {
    it('should update calendar successfully', async () => {
      const result = await service.updateCalendar(mockCalendar.id, {
        calendarName: 'Updated Service Schedule',
      });
      expect(result.calendar_name).toBe('Updated Service Schedule');
    });

    it('should reject update if revised endDate is before startDate', async () => {
      await expect(
        service.updateCalendar(mockCalendar.id, {
          endDate: '2025-01-01',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('deleteCalendar', () => {
    it('should delete calendar successfully', async () => {
      const result = await service.deleteCalendar(mockCalendar.id);
      expect(result.deleted).toBe(true);
    });
  });

  describe('Calendar Exceptions', () => {
    it('should create calendar exception', async () => {
      const result = await service.createException(mockCalendar.id, {
        exceptionDate: '2026-10-02',
        exceptionType: 'REMOVED',
        description: 'Gandhi Jayanti',
      });
      expect(result).toBeDefined();
      expect(repo.createException).toHaveBeenCalled();
    });

    it('should reject exception if already registered on that date', async () => {
      await expect(
        service.createException(mockCalendar.id, {
          exceptionDate: '2026-08-15',
          exceptionType: 'REMOVED',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should list calendar exceptions', async () => {
      const exceptions = await service.getExceptions(mockCalendar.id);
      expect(exceptions).toHaveLength(1);
    });

    it('should delete calendar exception', async () => {
      const result = await service.deleteException(mockCalendar.id, mockException.id);
      expect(result.deleted).toBe(true);
    });
  });

  describe('isCalendarActiveOnDate', () => {
    it('should report inactive if date is outside operational calendar range', async () => {
      const result = await service.isCalendarActiveOnDate(mockCalendar.id, '2027-05-01');
      expect(result.isActive).toBe(false);
      expect(result.reason).toContain('outside');
    });

    it('should report inactive if date has REMOVED exception (holiday)', async () => {
      const result = await service.isCalendarActiveOnDate(mockCalendar.id, '2026-08-15');
      expect(result.isActive).toBe(false);
      expect(result.hasException).toBe(true);
      expect(result.exceptionType).toBe('REMOVED');
    });

    it('should report inactive on Sunday when Sunday is false in calendar', async () => {
      // 2026-03-01 is a Sunday
      const result = await service.isCalendarActiveOnDate(mockCalendar.id, '2026-03-01');
      expect(result.isActive).toBe(false);
      expect(result.dayOfWeek).toBe('SUNDAY');
    });

    it('should report active on Monday when Monday is true in calendar', async () => {
      // 2026-03-02 is a Monday
      const result = await service.isCalendarActiveOnDate(mockCalendar.id, '2026-03-02');
      expect(result.isActive).toBe(true);
      expect(result.dayOfWeek).toBe('MONDAY');
    });
  });

  describe('getTransitModes', () => {
    it('should return platform transit modes', () => {
      const modes = service.getTransitModes();
      expect(modes.length).toBeGreaterThan(3);
      expect(modes.some((m) => m.mode === 'BUS')).toBe(true);
      expect(modes.some((m) => m.mode === 'METRO')).toBe(true);
    });
  });
});
