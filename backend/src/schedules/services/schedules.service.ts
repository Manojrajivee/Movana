import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { AddScheduleStopDto } from '../dto/add-schedule-stop.dto';
import { CreateTripScheduleDto } from '../dto/create-trip-schedule.dto';
import { QueryTripSchedulesDto } from '../dto/query-trip-schedules.dto';
import { UpdateScheduleStopDto } from '../dto/update-schedule-stop.dto';
import { UpdateTripScheduleDto } from '../dto/update-trip-schedule.dto';
import {
  ScheduleStopEntity,
  SchedulesRepository,
  TripScheduleEntity,
} from '../repositories/schedules.repository';

@Injectable()
export class SchedulesService {
  private readonly logger = new Logger(SchedulesService.name);

  constructor(
    private readonly repo: SchedulesRepository,
    private readonly db: DatabaseService,
  ) {}

  private async assertScheduleExists(id: string): Promise<TripScheduleEntity> {
    const schedule = await this.repo.findById(id);
    if (!schedule) {
      throw new NotFoundException(`Trip schedule with ID '${id}' not found`);
    }
    return schedule;
  }

  async createSchedule(dto: CreateTripScheduleDto): Promise<TripScheduleEntity> {
    const existing = await this.repo.findByCode(dto.scheduleCode);
    if (existing) {
      throw new ConflictException(`Schedule with code '${dto.scheduleCode}' already exists`);
    }

    const routeActive = await this.repo.checkRouteActive(dto.routeId);
    if (!routeActive) {
      throw new NotFoundException(`Active route with ID '${dto.routeId}' not found`);
    }

    const calendarExists = await this.repo.checkCalendarExists(dto.serviceCalendarId);
    if (!calendarExists) {
      throw new NotFoundException(`Service calendar with ID '${dto.serviceCalendarId}' not found`);
    }

    this.logger.log(
      `Creating master trip schedule ${dto.scheduleCode} for route ${dto.routeId} [${dto.departureTime} -> ${dto.arrivalTime}]`,
    );

    return this.db.withTransaction(async (client) => {
      const schedule = await this.repo.createSchedule(
        {
          scheduleCode: dto.scheduleCode,
          routeId: dto.routeId,
          serviceCalendarId: dto.serviceCalendarId,
          departureTime: dto.departureTime,
          arrivalTime: dto.arrivalTime,
          isActive: dto.isActive,
        },
        client,
      );

      // Automatically populate intermediate stops from route alignment
      const routeStops = await this.repo.findRouteStopsForRoute(dto.routeId, client);
      for (const rs of routeStops) {
        await this.repo.addScheduleStop(
          {
            scheduleId: schedule.id,
            stopId: rs.stop_id,
            sequenceNumber: rs.sequence_number,
            scheduledArrivalOffsetMinutes: rs.arrival_offset_minutes,
            scheduledDepartureOffsetMinutes: rs.departure_offset_minutes,
          },
          client,
        );
      }

      return {
        ...schedule,
        stops_count: routeStops.length,
      };
    });
  }

  async getSchedules(query: QueryTripSchedulesDto) {
    return this.repo.findAll({
      routeId: query.routeId,
      serviceCalendarId: query.serviceCalendarId,
      isActive: query.isActive,
      search: query.search,
      limit: query.limit,
      offset: query.offset,
    });
  }

  async getScheduleSummary(params: {
    routeCode?: string;
    isActive?: boolean;
    limit: number;
    offset: number;
  }) {
    return this.repo.findScheduleSummary(params);
  }

  async getScheduleById(id: string): Promise<TripScheduleEntity & { stops: ScheduleStopEntity[] }> {
    const schedule = await this.assertScheduleExists(id);
    const stops = await this.repo.findScheduleStops(id);
    return {
      ...schedule,
      stops,
    };
  }

  async updateSchedule(id: string, dto: UpdateTripScheduleDto): Promise<TripScheduleEntity> {
    await this.assertScheduleExists(id);

    if (dto.serviceCalendarId) {
      const calendarExists = await this.repo.checkCalendarExists(dto.serviceCalendarId);
      if (!calendarExists) {
        throw new NotFoundException(
          `Service calendar with ID '${dto.serviceCalendarId}' not found`,
        );
      }
    }

    this.logger.log(`Updating trip schedule details for ID '${id}'`);
    const updated = await this.repo.updateSchedule(id, dto);
    if (!updated) {
      throw new NotFoundException(`Trip schedule with ID '${id}' not found`);
    }
    return updated;
  }

  async deleteSchedule(id: string): Promise<TripScheduleEntity> {
    await this.assertScheduleExists(id);
    this.logger.log(`Deactivating trip schedule '${id}'`);
    const deactivated = await this.repo.deactivateSchedule(id);
    if (!deactivated) {
      throw new NotFoundException(`Trip schedule with ID '${id}' not found`);
    }
    return deactivated;
  }

  async addScheduleStop(scheduleId: string, dto: AddScheduleStopDto): Promise<ScheduleStopEntity> {
    await this.assertScheduleExists(scheduleId);

    const stopExists = await this.repo.checkStopExists(dto.stopId);
    if (!stopExists) {
      throw new NotFoundException(`Stop with ID '${dto.stopId}' not found`);
    }

    const existingStop = await this.repo.findScheduleStop(scheduleId, dto.stopId);
    if (existingStop) {
      throw new ConflictException(
        `Stop '${dto.stopId}' is already registered on schedule '${scheduleId}'`,
      );
    }

    this.logger.log(
      `Adding intermediate stop ${dto.stopId} at sequence #${dto.sequenceNumber} to schedule ${scheduleId}`,
    );

    return this.repo.addScheduleStop({
      scheduleId,
      stopId: dto.stopId,
      sequenceNumber: dto.sequenceNumber,
      scheduledArrivalOffsetMinutes: dto.scheduledArrivalOffsetMinutes,
      scheduledDepartureOffsetMinutes: dto.scheduledDepartureOffsetMinutes,
    });
  }

  async getScheduleStops(scheduleId: string): Promise<ScheduleStopEntity[]> {
    await this.assertScheduleExists(scheduleId);
    return this.repo.findScheduleStops(scheduleId);
  }

  async updateScheduleStop(
    scheduleId: string,
    stopId: string,
    dto: UpdateScheduleStopDto,
  ): Promise<ScheduleStopEntity> {
    await this.assertScheduleExists(scheduleId);

    const existing = await this.repo.findScheduleStop(scheduleId, stopId);
    if (!existing) {
      throw new NotFoundException(
        `Stop '${stopId}' is not part of schedule '${scheduleId}' intermediate stops`,
      );
    }

    const effectiveArrival =
      dto.scheduledArrivalOffsetMinutes !== undefined
        ? dto.scheduledArrivalOffsetMinutes
        : existing.scheduled_arrival_offset_minutes;
    const effectiveDeparture =
      dto.scheduledDepartureOffsetMinutes !== undefined
        ? dto.scheduledDepartureOffsetMinutes
        : existing.scheduled_departure_offset_minutes;

    if (effectiveDeparture < effectiveArrival) {
      throw new BadRequestException(
        'scheduledDepartureOffsetMinutes must be greater than or equal to scheduledArrivalOffsetMinutes',
      );
    }

    this.logger.log(`Updating scheduled offsets for stop ${stopId} on schedule ${scheduleId}`);
    const updated = await this.repo.updateScheduleStop(scheduleId, stopId, dto);
    if (!updated) {
      throw new NotFoundException(`Stop '${stopId}' not found on schedule '${scheduleId}'`);
    }
    return updated;
  }

  async deleteScheduleStop(scheduleId: string, stopId: string): Promise<ScheduleStopEntity> {
    await this.assertScheduleExists(scheduleId);

    const existing = await this.repo.findScheduleStop(scheduleId, stopId);
    if (!existing) {
      throw new NotFoundException(
        `Stop '${stopId}' is not part of schedule '${scheduleId}' intermediate stops`,
      );
    }

    this.logger.log(`Removing stop ${stopId} from schedule ${scheduleId}`);
    const deleted = await this.repo.deleteScheduleStop(scheduleId, stopId);
    if (!deleted) {
      throw new NotFoundException(`Stop '${stopId}' not found on schedule '${scheduleId}'`);
    }
    return deleted;
  }
}
