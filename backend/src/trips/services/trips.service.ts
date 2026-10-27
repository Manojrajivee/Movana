import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CreateAdHocTripDto } from '../dto/create-ad-hoc-trip.dto';
import { CancelTripDto } from '../dto/cancel-trip.dto';
import { DispatchScheduleDto } from '../dto/dispatch-schedule.dto';
import { QueryTripsDto } from '../dto/query-trips.dto';
import { UpdateTripDto } from '../dto/update-trip.dto';
import { TripEntity, TripStopEntity, TripsRepository } from '../repositories/trips.repository';

@Injectable()
export class TripsService {
  private readonly logger = new Logger(TripsService.name);

  constructor(private readonly repo: TripsRepository) {}

  async dispatchSchedule(
    dto: DispatchScheduleDto,
    userId?: string,
  ): Promise<{ trip: TripEntity; stops: TripStopEntity[] }> {
    const schedule = await this.repo.findScheduleById(dto.scheduleId);
    if (!schedule) {
      throw new NotFoundException(`Schedule with ID '${dto.scheduleId}' not found`);
    }
    if (!schedule.is_active) {
      throw new BadRequestException(`Schedule '${schedule.schedule_code}' is currently inactive`);
    }

    if (dto.vehicleId) {
      const vehicle = await this.repo.findVehicleById(dto.vehicleId);
      if (!vehicle) {
        throw new NotFoundException(`Vehicle with ID '${dto.vehicleId}' not found`);
      }
      if (vehicle.status !== 'ACTIVE') {
        throw new BadRequestException(`Vehicle '${vehicle.registration_number}' is not ACTIVE`);
      }
    }

    if (dto.primaryDriverId) {
      const driver = await this.repo.findDriverById(dto.primaryDriverId);
      if (!driver) {
        throw new NotFoundException(`Primary driver with ID '${dto.primaryDriverId}' not found`);
      }
      if (driver.status !== 'ACTIVE') {
        throw new BadRequestException(`Driver with ID '${dto.primaryDriverId}' is not ACTIVE`);
      }
    }

    if (dto.secondaryDriverId) {
      if (dto.secondaryDriverId === dto.primaryDriverId) {
        throw new BadRequestException('Primary driver and secondary driver must be distinct');
      }
      const driver2 = await this.repo.findDriverById(dto.secondaryDriverId);
      if (!driver2) {
        throw new NotFoundException(
          `Secondary driver with ID '${dto.secondaryDriverId}' not found`,
        );
      }
      if (driver2.status !== 'ACTIVE') {
        throw new BadRequestException(
          `Secondary driver with ID '${dto.secondaryDriverId}' is not ACTIVE`,
        );
      }
    }

    // Calculate dates
    const depTimeParts = schedule.departure_time.split(':');
    const arrTimeParts = schedule.arrival_time.split(':');

    const scheduledDep = new Date(
      `${dto.serviceDate}T${depTimeParts[0].padStart(2, '0')}:${depTimeParts[1].padStart(2, '0')}:00Z`,
    );
    let scheduledArr = new Date(
      `${dto.serviceDate}T${arrTimeParts[0].padStart(2, '0')}:${arrTimeParts[1].padStart(2, '0')}:00Z`,
    );

    if (scheduledArr <= scheduledDep) {
      scheduledArr = new Date(scheduledArr.getTime() + 24 * 60 * 60 * 1000);
    }

    const tripNumber =
      dto.tripNumber ||
      `${schedule.schedule_code}-${dto.serviceDate.replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;

    const existingTrip = await this.repo.findTripByNumber(tripNumber);
    if (existingTrip) {
      throw new ConflictException(`Trip with number '${tripNumber}' already exists`);
    }

    let scheduleStops = await this.repo.findScheduleStops(schedule.id);
    if (scheduleStops.length === 0) {
      const routeStops = await this.repo.findRouteStops(schedule.route_id);
      scheduleStops = routeStops.map((rs) => ({
        stop_id: rs.stop_id,
        sequence_number: rs.sequence_number,
        scheduled_arrival_offset_minutes: rs.arrival_offset_minutes,
        scheduled_departure_offset_minutes: rs.departure_offset_minutes,
      }));
    }

    const stopsData = scheduleStops.map((ss) => ({
      stopId: ss.stop_id,
      sequenceNumber: ss.sequence_number,
      scheduledArrivalAt: new Date(
        scheduledDep.getTime() + (ss.scheduled_arrival_offset_minutes || 0) * 60000,
      ),
      scheduledDepartureAt: new Date(
        scheduledDep.getTime() + (ss.scheduled_departure_offset_minutes || 0) * 60000,
      ),
    }));

    const trip = await this.repo.createTripWithStops(
      {
        tripNumber,
        routeId: schedule.route_id,
        scheduleId: schedule.id,
        vehicleId: dto.vehicleId,
        primaryDriverId: dto.primaryDriverId,
        secondaryDriverId: dto.secondaryDriverId,
        scheduledDepartureAt: scheduledDep,
        scheduledArrivalAt: scheduledArr,
        status: 'SCHEDULED',
      },
      stopsData,
      userId,
    );

    const fullTrip = (await this.repo.findTripById(trip.id)) || trip;
    const stops = await this.repo.findTripStops(trip.id);
    return { trip: fullTrip, stops };
  }

  async createAdHocTrip(
    dto: CreateAdHocTripDto,
    userId?: string,
  ): Promise<{ trip: TripEntity; stops: TripStopEntity[] }> {
    const depTime = new Date(dto.scheduledDepartureAt).getTime();
    const arrTime = new Date(dto.scheduledArrivalAt).getTime();

    if (isNaN(depTime) || isNaN(arrTime) || arrTime <= depTime) {
      throw new BadRequestException(
        'Scheduled arrival time must be after scheduled departure time',
      );
    }

    const route = await this.repo.findRouteById(dto.routeId);
    if (!route) {
      throw new NotFoundException(`Route with ID '${dto.routeId}' not found`);
    }
    if (route.status !== 'ACTIVE') {
      throw new BadRequestException(`Route '${route.route_code}' is not ACTIVE`);
    }

    if (dto.vehicleId) {
      const vehicle = await this.repo.findVehicleById(dto.vehicleId);
      if (!vehicle) {
        throw new NotFoundException(`Vehicle with ID '${dto.vehicleId}' not found`);
      }
      if (vehicle.status !== 'ACTIVE') {
        throw new BadRequestException(`Vehicle '${vehicle.registration_number}' is not ACTIVE`);
      }
    }

    if (dto.primaryDriverId) {
      const driver = await this.repo.findDriverById(dto.primaryDriverId);
      if (!driver) {
        throw new NotFoundException(`Primary driver with ID '${dto.primaryDriverId}' not found`);
      }
      if (driver.status !== 'ACTIVE') {
        throw new BadRequestException(`Driver with ID '${dto.primaryDriverId}' is not ACTIVE`);
      }
    }

    if (dto.secondaryDriverId) {
      if (dto.secondaryDriverId === dto.primaryDriverId) {
        throw new BadRequestException('Primary driver and secondary driver must be distinct');
      }
      const driver2 = await this.repo.findDriverById(dto.secondaryDriverId);
      if (!driver2) {
        throw new NotFoundException(
          `Secondary driver with ID '${dto.secondaryDriverId}' not found`,
        );
      }
      if (driver2.status !== 'ACTIVE') {
        throw new BadRequestException(
          `Secondary driver with ID '${dto.secondaryDriverId}' is not ACTIVE`,
        );
      }
    }

    const tripNumber =
      dto.tripNumber || `ADHOC-${route.route_code}-${Date.now().toString().slice(-6)}`;

    const existingTrip = await this.repo.findTripByNumber(tripNumber);
    if (existingTrip) {
      throw new ConflictException(`Trip with number '${tripNumber}' already exists`);
    }

    const routeStops = await this.repo.findRouteStops(route.id);
    const stopsData = routeStops.map((rs) => ({
      stopId: rs.stop_id,
      sequenceNumber: rs.sequence_number,
      scheduledArrivalAt: new Date(depTime + (rs.arrival_offset_minutes || 0) * 60000),
      scheduledDepartureAt: new Date(depTime + (rs.departure_offset_minutes || 0) * 60000),
    }));

    const trip = await this.repo.createTripWithStops(
      {
        tripNumber,
        routeId: route.id,
        scheduleId: null,
        vehicleId: dto.vehicleId,
        primaryDriverId: dto.primaryDriverId,
        secondaryDriverId: dto.secondaryDriverId,
        scheduledDepartureAt: new Date(depTime),
        scheduledArrivalAt: new Date(arrTime),
        status: 'SCHEDULED',
      },
      stopsData,
      userId,
    );

    const fullTrip = (await this.repo.findTripById(trip.id)) || trip;
    const stops = await this.repo.findTripStops(trip.id);
    return { trip: fullTrip, stops };
  }

  async getTrips(query: QueryTripsDto) {
    const { trips, total } = await this.repo.queryTrips(query);
    return {
      data: trips,
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.ceil(total / query.limit),
    };
  }

  async getTripById(id: string): Promise<{ trip: TripEntity; stops: TripStopEntity[] }> {
    const trip = await this.repo.findTripById(id);
    if (!trip) {
      throw new NotFoundException(`Trip with ID '${id}' not found`);
    }
    const stops = await this.repo.findTripStops(id);
    return { trip, stops };
  }

  async getTripStops(id: string): Promise<TripStopEntity[]> {
    const trip = await this.repo.findTripById(id);
    if (!trip) {
      throw new NotFoundException(`Trip with ID '${id}' not found`);
    }
    return this.repo.findTripStops(id);
  }

  async updateTrip(id: string, dto: UpdateTripDto): Promise<TripEntity> {
    const trip = await this.repo.findTripById(id);
    if (!trip) {
      throw new NotFoundException(`Trip with ID '${id}' not found`);
    }

    if (['COMPLETED', 'CANCELLED'].includes(trip.status)) {
      throw new BadRequestException(`Cannot modify a trip that is already ${trip.status}`);
    }

    if (dto.scheduledDepartureAt || dto.scheduledArrivalAt) {
      const depTime = dto.scheduledDepartureAt
        ? new Date(dto.scheduledDepartureAt).getTime()
        : new Date(trip.scheduled_departure_at).getTime();
      const arrTime = dto.scheduledArrivalAt
        ? new Date(dto.scheduledArrivalAt).getTime()
        : new Date(trip.scheduled_arrival_at).getTime();

      if (isNaN(depTime) || isNaN(arrTime) || arrTime <= depTime) {
        throw new BadRequestException(
          'Scheduled arrival time must be after scheduled departure time',
        );
      }
    }

    if (dto.vehicleId) {
      const vehicle = await this.repo.findVehicleById(dto.vehicleId);
      if (!vehicle) {
        throw new NotFoundException(`Vehicle with ID '${dto.vehicleId}' not found`);
      }
      if (vehicle.status !== 'ACTIVE') {
        throw new BadRequestException(`Vehicle '${vehicle.registration_number}' is not ACTIVE`);
      }
    }

    if (dto.primaryDriverId) {
      const driver = await this.repo.findDriverById(dto.primaryDriverId);
      if (!driver) {
        throw new NotFoundException(`Primary driver with ID '${dto.primaryDriverId}' not found`);
      }
      if (driver.status !== 'ACTIVE') {
        throw new BadRequestException(`Driver with ID '${dto.primaryDriverId}' is not ACTIVE`);
      }
    }

    if (dto.secondaryDriverId) {
      const primaryId =
        dto.primaryDriverId !== undefined ? dto.primaryDriverId : trip.primary_driver_id;
      if (dto.secondaryDriverId === primaryId) {
        throw new BadRequestException('Primary driver and secondary driver must be distinct');
      }
      const driver2 = await this.repo.findDriverById(dto.secondaryDriverId);
      if (!driver2) {
        throw new NotFoundException(
          `Secondary driver with ID '${dto.secondaryDriverId}' not found`,
        );
      }
      if (driver2.status !== 'ACTIVE') {
        throw new BadRequestException(
          `Secondary driver with ID '${dto.secondaryDriverId}' is not ACTIVE`,
        );
      }
    }

    const updated = await this.repo.updateTrip(id, {
      vehicleId: dto.vehicleId,
      primaryDriverId: dto.primaryDriverId,
      secondaryDriverId: dto.secondaryDriverId,
      scheduledDepartureAt: dto.scheduledDepartureAt
        ? new Date(dto.scheduledDepartureAt)
        : undefined,
      scheduledArrivalAt: dto.scheduledArrivalAt ? new Date(dto.scheduledArrivalAt) : undefined,
    });

    return updated || trip;
  }

  async cancelTrip(id: string, dto: CancelTripDto, userId?: string): Promise<TripEntity> {
    const trip = await this.repo.findTripById(id);
    if (!trip) {
      throw new NotFoundException(`Trip with ID '${id}' not found`);
    }

    if (trip.status === 'CANCELLED') {
      throw new ConflictException(`Trip '${trip.trip_number}' is already cancelled`);
    }
    if (trip.status === 'COMPLETED') {
      throw new BadRequestException(`Cannot cancel a trip that has already completed`);
    }

    return this.repo.cancelTrip(id, dto.reason, userId);
  }
}
