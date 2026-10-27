import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateCalendarExceptionDto } from '../dto/create-calendar-exception.dto';
import { CreateServiceCalendarDto } from '../dto/create-service-calendar.dto';
import { QueryServiceCalendarsDto } from '../dto/query-service-calendars.dto';
import { UpdateServiceCalendarDto } from '../dto/update-service-calendar.dto';
import {
  ServiceCalendarEntity,
  ServiceCalendarExceptionEntity,
  TransportFoundationRepository,
} from '../repositories/transport-foundation.repository';

export interface CalendarActiveCheckResult {
  calendarId: string;
  date: string;
  isActive: boolean;
  reason: string;
  dayOfWeek?: string;
  hasException?: boolean;
  exceptionType?: 'ADDED' | 'REMOVED' | null;
}

export interface TransitModeDefinition {
  mode: string;
  name: string;
  description: string;
  defaultBoardingBufferMinutes: number;
  maxSeatCapacityGuideline: number;
  supportsWheelchairAccess: boolean;
}

@Injectable()
export class TransportFoundationService {
  constructor(private readonly repo: TransportFoundationRepository) {}

  async createCalendar(dto: CreateServiceCalendarDto): Promise<ServiceCalendarEntity> {
    if (new Date(dto.endDate) < new Date(dto.startDate)) {
      throw new BadRequestException('endDate must be greater than or equal to startDate');
    }

    return this.repo.createCalendar({
      calendarName: dto.calendarName,
      startDate: dto.startDate,
      endDate: dto.endDate,
      monday: dto.monday,
      tuesday: dto.tuesday,
      wednesday: dto.wednesday,
      thursday: dto.thursday,
      friday: dto.friday,
      saturday: dto.saturday,
      sunday: dto.sunday,
    });
  }

  async getCalendarById(
    id: string,
  ): Promise<ServiceCalendarEntity & { exceptions: ServiceCalendarExceptionEntity[] }> {
    const calendar = await this.repo.findCalendarById(id);
    if (!calendar) {
      throw new NotFoundException(`Service calendar with ID '${id}' not found`);
    }

    const exceptions = await this.repo.findExceptionsByCalendarId(id);
    return {
      ...calendar,
      exceptions,
    };
  }

  async getCalendars(
    query: QueryServiceCalendarsDto,
  ): Promise<{ calendars: ServiceCalendarEntity[]; total: number; limit: number; offset: number }> {
    const result = await this.repo.findCalendars({
      search: query.search,
      activeOnDate: query.activeOnDate,
      limit: query.limit ?? 20,
      offset: query.offset ?? 0,
    });

    return {
      calendars: result.calendars,
      total: result.total,
      limit: query.limit ?? 20,
      offset: query.offset ?? 0,
    };
  }

  async updateCalendar(id: string, dto: UpdateServiceCalendarDto): Promise<ServiceCalendarEntity> {
    const existing = await this.repo.findCalendarById(id);
    if (!existing) {
      throw new NotFoundException(`Service calendar with ID '${id}' not found`);
    }

    const startDate = dto.startDate ?? existing.start_date;
    const endDate = dto.endDate ?? existing.end_date;

    if (new Date(endDate) < new Date(startDate)) {
      throw new BadRequestException('endDate must be greater than or equal to startDate');
    }

    const updated = await this.repo.updateCalendar(id, dto);
    if (!updated) {
      throw new NotFoundException(`Service calendar with ID '${id}' not found`);
    }

    return updated;
  }

  async deleteCalendar(id: string): Promise<{ deleted: boolean }> {
    const existing = await this.repo.findCalendarById(id);
    if (!existing) {
      throw new NotFoundException(`Service calendar with ID '${id}' not found`);
    }

    const deleted = await this.repo.deleteCalendar(id);
    return { deleted };
  }

  async createException(
    calendarId: string,
    dto: CreateCalendarExceptionDto,
  ): Promise<ServiceCalendarExceptionEntity> {
    const calendar = await this.repo.findCalendarById(calendarId);
    if (!calendar) {
      throw new NotFoundException(`Service calendar with ID '${calendarId}' not found`);
    }

    const existingExc = await this.repo.findExceptionByCalendarAndDate(
      calendarId,
      dto.exceptionDate,
    );
    if (existingExc) {
      throw new ConflictException(
        `Calendar exception for date '${dto.exceptionDate}' already exists on calendar '${calendarId}'`,
      );
    }

    return this.repo.createException({
      serviceCalendarId: calendarId,
      exceptionDate: dto.exceptionDate,
      exceptionType: dto.exceptionType,
      description: dto.description,
    });
  }

  async getExceptions(calendarId: string): Promise<ServiceCalendarExceptionEntity[]> {
    const calendar = await this.repo.findCalendarById(calendarId);
    if (!calendar) {
      throw new NotFoundException(`Service calendar with ID '${calendarId}' not found`);
    }

    return this.repo.findExceptionsByCalendarId(calendarId);
  }

  async deleteException(calendarId: string, exceptionId: string): Promise<{ deleted: boolean }> {
    const exception = await this.repo.findExceptionById(exceptionId);
    if (!exception || exception.service_calendar_id !== calendarId) {
      throw new NotFoundException(
        `Calendar exception with ID '${exceptionId}' not found on calendar '${calendarId}'`,
      );
    }

    const deleted = await this.repo.deleteException(exceptionId);
    return { deleted };
  }

  async isCalendarActiveOnDate(
    calendarId: string,
    dateString: string,
  ): Promise<CalendarActiveCheckResult> {
    const calendar = await this.repo.findCalendarById(calendarId);
    if (!calendar) {
      throw new NotFoundException(`Service calendar with ID '${calendarId}' not found`);
    }

    const targetDate = new Date(`${dateString}T00:00:00Z`);
    const calStart = new Date(`${calendar.start_date}T00:00:00Z`);
    const calEnd = new Date(`${calendar.end_date}T23:59:59Z`);

    if (targetDate < calStart || targetDate > calEnd) {
      return {
        calendarId,
        date: dateString,
        isActive: false,
        reason: 'Target date is outside calendar operational date range',
        hasException: false,
      };
    }

    const exception = await this.repo.findExceptionByCalendarAndDate(calendarId, dateString);

    if (exception) {
      if (exception.exception_type === 'REMOVED') {
        return {
          calendarId,
          date: dateString,
          isActive: false,
          reason: `Service cancelled by calendar exception: ${exception.description ?? 'Holiday/Maintenance'}`,
          hasException: true,
          exceptionType: 'REMOVED',
        };
      } else if (exception.exception_type === 'ADDED') {
        return {
          calendarId,
          date: dateString,
          isActive: true,
          reason: `Special service added by calendar exception: ${exception.description ?? 'Special timetable'}`,
          hasException: true,
          exceptionType: 'ADDED',
        };
      }
    }

    const dayIndex = targetDate.getUTCDay(); // 0 is Sunday, 1 is Monday, ...
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const currentDayName = dayNames[dayIndex];

    const isDayActive = Boolean((calendar as any)[currentDayName]);

    return {
      calendarId,
      date: dateString,
      isActive: isDayActive,
      dayOfWeek: currentDayName.toUpperCase(),
      reason: isDayActive
        ? `Regularly scheduled service on ${currentDayName.toUpperCase()}`
        : `No scheduled service on ${currentDayName.toUpperCase()}`,
      hasException: false,
      exceptionType: null,
    };
  }

  getTransitModes(): TransitModeDefinition[] {
    return [
      {
        mode: 'BUS',
        name: 'City Bus / Coach',
        description: 'Standard urban, feeder, and intercity bus routes',
        defaultBoardingBufferMinutes: 3,
        maxSeatCapacityGuideline: 70,
        supportsWheelchairAccess: true,
      },
      {
        mode: 'BRT',
        name: 'Bus Rapid Transit',
        description: 'High-frequency dedicated transitway bus services',
        defaultBoardingBufferMinutes: 2,
        maxSeatCapacityGuideline: 120,
        supportsWheelchairAccess: true,
      },
      {
        mode: 'METRO',
        name: 'Urban Metro / Subway',
        description: 'Grade-separated rapid rail transit system',
        defaultBoardingBufferMinutes: 1,
        maxSeatCapacityGuideline: 1000,
        supportsWheelchairAccess: true,
      },
      {
        mode: 'TRAM',
        name: 'Light Rail / Tramway',
        description: 'Street-level urban light rail system',
        defaultBoardingBufferMinutes: 2,
        maxSeatCapacityGuideline: 250,
        supportsWheelchairAccess: true,
      },
      {
        mode: 'FERRY',
        name: 'Water Transit / Ferry',
        description: 'Scheduled passenger marine ferry connections',
        defaultBoardingBufferMinutes: 10,
        maxSeatCapacityGuideline: 300,
        supportsWheelchairAccess: false,
      },
      {
        mode: 'RAIL',
        name: 'Regional Passenger Rail',
        description: 'Suburban commuter and regional express passenger rail',
        defaultBoardingBufferMinutes: 5,
        maxSeatCapacityGuideline: 1200,
        supportsWheelchairAccess: true,
      },
    ];
  }
}
