import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { DatabaseService } from '../../database/database.service';
import { DriversRepository } from '../../drivers/repositories/drivers.repository';
import { FleetRepository } from '../../fleet/repositories/fleet.repository';
import { AssignTripCrewDto } from '../dto/assign-trip-crew.dto';
import { CreateTripDto } from '../dto/create-trip.dto';
import { QueryTripsDto } from '../dto/query-trips.dto';
import { RecordTripEventDto } from '../dto/record-trip-event.dto';
import { UpdateTripStatusDto } from '../dto/update-trip-status.dto';
import {
  DispatchSummary,
  TripAssignmentEntity,
  TripEntity,
  TripEventEntity,
  TripStatusHistoryEntity,
  TransportOperationsRepository,
} from '../repositories/transport-operations.repository';

@Injectable()
export class TransportOperationsService {
  constructor(
    private readonly repo: TransportOperationsRepository,
    private readonly fleetRepo: FleetRepository,
    private readonly driversRepo: DriversRepository,
    private readonly db: DatabaseService,
  ) {}

  async createTrip(dto: CreateTripDto, currentUser: AuthenticatedUser): Promise<TripEntity> {
    const depTime = new Date(dto.scheduledDepartureAt).getTime();
    const arrTime = new Date(dto.scheduledArrivalAt).getTime();

    if (isNaN(depTime) || isNaN(arrTime) || arrTime <= depTime) {
      throw new BadRequestException(
        'Scheduled arrival time must be after scheduled departure time',
      );
    }

    const existingTrip = await this.repo.findTripByNumber(dto.tripNumber);
    if (existingTrip) {
      throw new ConflictException(`Trip with number '${dto.tripNumber}' already exists`);
    }

    const route = await this.repo.findRouteById(dto.routeId);
    if (!route) {
      throw new NotFoundException(`Route with ID '${dto.routeId}' not found`);
    }

    if (dto.vehicleId) {
      const vehicle = await this.fleetRepo.findVehicleById(dto.vehicleId);
      if (!vehicle) {
        throw new NotFoundException(`Vehicle with ID '${dto.vehicleId}' not found`);
      }
      if (vehicle.status !== 'ACTIVE') {
        throw new BadRequestException(
          `Vehicle '${vehicle.registration_number}' is not ACTIVE (current: ${vehicle.status})`,
        );
      }
    }

    if (dto.primaryDriverId) {
      const driver = await this.driversRepo.findById(dto.primaryDriverId);
      if (!driver) {
        throw new NotFoundException(`Primary driver with ID '${dto.primaryDriverId}' not found`);
      }
      if (driver.employmentStatus !== 'ACTIVE') {
        throw new BadRequestException(
          `Primary driver '${driver.id}' is not ACTIVE (current: ${driver.employmentStatus})`,
        );
      }
    }

    if (dto.secondaryDriverId) {
      if (dto.secondaryDriverId === dto.primaryDriverId) {
        throw new BadRequestException('Primary and secondary drivers cannot be the same');
      }
      const secDriver = await this.driversRepo.findById(dto.secondaryDriverId);
      if (!secDriver) {
        throw new NotFoundException(
          `Secondary driver with ID '${dto.secondaryDriverId}' not found`,
        );
      }
      if (secDriver.employmentStatus !== 'ACTIVE') {
        throw new BadRequestException(
          `Secondary driver '${secDriver.id}' is not ACTIVE (current: ${secDriver.employmentStatus})`,
        );
      }
    }

    return this.db.withTransaction(async (client) => {
      const trip = await this.repo.createTrip(
        {
          tripNumber: dto.tripNumber,
          routeId: dto.routeId,
          scheduleId: dto.scheduleId,
          vehicleId: dto.vehicleId,
          primaryDriverId: dto.primaryDriverId,
          secondaryDriverId: dto.secondaryDriverId,
          scheduledDepartureAt: dto.scheduledDepartureAt,
          scheduledArrivalAt: dto.scheduledArrivalAt,
          status: 'SCHEDULED',
        },
        client,
      );

      await this.repo.recordStatusHistory(
        {
          tripId: trip.id,
          oldStatus: 'NONE',
          newStatus: 'SCHEDULED',
          reason: 'Initial operational dispatch provisioning',
          changedBy: currentUser.id,
        },
        client,
      );

      if (dto.vehicleId && dto.primaryDriverId) {
        await this.repo.createTripAssignment(
          {
            tripId: trip.id,
            driverId: dto.primaryDriverId,
            vehicleId: dto.vehicleId,
            assignmentType: 'PRIMARY_DRIVER',
            status: 'ACTIVE',
          },
          client,
        );
      }

      return trip;
    });
  }

  async getTripById(id: string, currentUser: AuthenticatedUser): Promise<TripEntity> {
    const trip = await this.repo.findTripById(id);
    if (!trip) {
      throw new NotFoundException(`Trip with ID '${id}' not found`);
    }

    // Role boundary checks for DRIVER
    if (
      currentUser.roles.includes('DRIVER') &&
      !currentUser.roles.some((r) => ['ADMIN', 'OPERATOR', 'FLEET_MANAGER'].includes(r))
    ) {
      const driver = await this.driversRepo.findByUserId(currentUser.id);
      if (
        !driver ||
        (trip.primary_driver_id !== driver.id && trip.secondary_driver_id !== driver.id)
      ) {
        throw new ForbiddenException('Access denied: cannot view unassigned trip');
      }
    }

    return trip;
  }

  async getTrips(
    query: QueryTripsDto,
    currentUser: AuthenticatedUser,
  ): Promise<{ trips: TripEntity[]; total: number; limit: number; offset: number }> {
    let effectiveDriverId = query.driverId;

    if (
      currentUser.roles.includes('DRIVER') &&
      !currentUser.roles.some((r) => ['ADMIN', 'OPERATOR', 'FLEET_MANAGER'].includes(r))
    ) {
      const driver = await this.driversRepo.findByUserId(currentUser.id);
      if (!driver) {
        return { trips: [], total: 0, limit: query.limit ?? 20, offset: query.offset ?? 0 };
      }
      effectiveDriverId = driver.id;
    }

    const result = await this.repo.findTrips({
      status: query.status,
      routeId: query.routeId,
      vehicleId: query.vehicleId,
      driverId: effectiveDriverId,
      date: query.date,
      limit: query.limit ?? 20,
      offset: query.offset ?? 0,
    });

    return {
      trips: result.trips,
      total: result.total,
      limit: query.limit ?? 20,
      offset: query.offset ?? 0,
    };
  }

  async updateTripStatus(
    id: string,
    dto: UpdateTripStatusDto,
    currentUser: AuthenticatedUser,
  ): Promise<TripEntity> {
    const trip = await this.repo.findTripById(id);
    if (!trip) {
      throw new NotFoundException(`Trip with ID '${id}' not found`);
    }

    if (
      currentUser.roles.includes('DRIVER') &&
      !currentUser.roles.some((r) => ['ADMIN', 'OPERATOR'].includes(r))
    ) {
      const driver = await this.driversRepo.findByUserId(currentUser.id);
      if (
        !driver ||
        (trip.primary_driver_id !== driver.id && trip.secondary_driver_id !== driver.id)
      ) {
        throw new ForbiddenException('Access denied: cannot update status of unassigned trip');
      }
    }

    const oldStatus = trip.status;
    const newStatus = dto.status;

    if (oldStatus === newStatus) {
      return trip;
    }

    // Terminal status checks
    if (['COMPLETED', 'CANCELLED'].includes(oldStatus)) {
      throw new BadRequestException(`Cannot transition status from terminal state '${oldStatus}'`);
    }

    let actualDepartureAt: Date | null | undefined = undefined;
    let actualArrivalAt: Date | null | undefined = undefined;

    if (['DEPARTED', 'IN_TRANSIT'].includes(newStatus) && !trip.actual_departure_at) {
      actualDepartureAt = new Date();
    }

    if (['ARRIVED', 'COMPLETED'].includes(newStatus) && !trip.actual_arrival_at) {
      actualArrivalAt = new Date();
    }

    return this.db.withTransaction(async (client) => {
      const updatedTrip = await this.repo.updateTripStatus(
        id,
        {
          status: newStatus,
          actualDepartureAt,
          actualArrivalAt,
          delayMinutes: dto.delayMinutes,
          currentStopId: dto.currentStopId,
          currentLatitude: dto.currentLatitude,
          currentLongitude: dto.currentLongitude,
        },
        client,
      );

      if (!updatedTrip) {
        throw new NotFoundException(`Trip with ID '${id}' not found`);
      }

      await this.repo.recordStatusHistory(
        {
          tripId: id,
          oldStatus,
          newStatus,
          reason: dto.reason ?? null,
          changedBy: currentUser.id,
        },
        client,
      );

      await this.repo.createTripEvent(
        {
          tripId: id,
          vehicleId: updatedTrip.vehicle_id,
          driverId: updatedTrip.primary_driver_id,
          eventType: 'STATUS_CHANGED',
          eventData: {
            oldStatus,
            newStatus,
            delayMinutes: dto.delayMinutes ?? 0,
            reason: dto.reason ?? null,
          },
        },
        client,
      );

      return updatedTrip;
    });
  }

  async recordTripEvent(
    tripId: string,
    dto: RecordTripEventDto,
    currentUser: AuthenticatedUser,
  ): Promise<TripEventEntity> {
    const trip = await this.repo.findTripById(tripId);
    if (!trip) {
      throw new NotFoundException(`Trip with ID '${tripId}' not found`);
    }

    if (
      currentUser.roles.includes('DRIVER') &&
      !currentUser.roles.some((r) => ['ADMIN', 'OPERATOR'].includes(r))
    ) {
      const driver = await this.driversRepo.findByUserId(currentUser.id);
      if (
        !driver ||
        (trip.primary_driver_id !== driver.id && trip.secondary_driver_id !== driver.id)
      ) {
        throw new ForbiddenException('Access denied: cannot record events on unassigned trip');
      }
    }

    return this.repo.createTripEvent({
      tripId,
      vehicleId: dto.vehicleId ?? trip.vehicle_id,
      driverId: dto.driverId ?? trip.primary_driver_id,
      eventType: dto.eventType,
      eventData: dto.eventData ?? {},
      occurredAt: dto.occurredAt,
    });
  }

  async assignCrew(
    tripId: string,
    dto: AssignTripCrewDto,
    _currentUser: AuthenticatedUser,
  ): Promise<TripAssignmentEntity> {
    const trip = await this.repo.findTripById(tripId);
    if (!trip) {
      throw new NotFoundException(`Trip with ID '${tripId}' not found`);
    }

    const vehicle = await this.fleetRepo.findVehicleById(dto.vehicleId);
    if (!vehicle) {
      throw new NotFoundException(`Vehicle with ID '${dto.vehicleId}' not found`);
    }
    if (vehicle.status !== 'ACTIVE') {
      throw new BadRequestException(
        `Vehicle '${vehicle.registration_number}' is not ACTIVE (current: ${vehicle.status})`,
      );
    }

    const driver = await this.driversRepo.findById(dto.driverId);
    if (!driver) {
      throw new NotFoundException(`Driver with ID '${dto.driverId}' not found`);
    }
    if (driver.employmentStatus !== 'ACTIVE') {
      throw new BadRequestException(
        `Driver '${driver.id}' is not ACTIVE (current: ${driver.employmentStatus})`,
      );
    }

    return this.db.withTransaction(async (client) => {
      const assignment = await this.repo.createTripAssignment(
        {
          tripId,
          driverId: dto.driverId,
          vehicleId: dto.vehicleId,
          assignmentType: dto.assignmentType ?? 'PRIMARY_DRIVER',
          status: 'ACTIVE',
        },
        client,
      );

      const updateData: {
        vehicleId: string;
        primaryDriverId?: string;
        secondaryDriverId?: string;
      } = {
        vehicleId: dto.vehicleId,
      };

      if (dto.assignmentType === 'SECONDARY_DRIVER') {
        updateData.secondaryDriverId = dto.driverId;
      } else {
        updateData.primaryDriverId = dto.driverId;
      }

      await this.repo.updateTripCrew(tripId, updateData, client);

      await this.repo.createTripEvent(
        {
          tripId,
          vehicleId: dto.vehicleId,
          driverId: dto.driverId,
          eventType: 'CREW_ASSIGNED',
          eventData: {
            assignmentType: dto.assignmentType ?? 'PRIMARY_DRIVER',
            assignmentId: assignment.id,
          },
        },
        client,
      );

      return assignment;
    });
  }

  async getTripEvents(tripId: string, currentUser: AuthenticatedUser): Promise<TripEventEntity[]> {
    await this.getTripById(tripId, currentUser);
    return this.repo.findTripEvents(tripId);
  }

  async getTripAssignments(
    tripId: string,
    currentUser: AuthenticatedUser,
  ): Promise<TripAssignmentEntity[]> {
    await this.getTripById(tripId, currentUser);
    return this.repo.findTripAssignments(tripId);
  }

  async getTripStatusHistory(
    tripId: string,
    currentUser: AuthenticatedUser,
  ): Promise<TripStatusHistoryEntity[]> {
    await this.getTripById(tripId, currentUser);
    return this.repo.findStatusHistoryByTripId(tripId);
  }

  async getDispatchSummary(_currentUser: AuthenticatedUser): Promise<DispatchSummary> {
    return this.repo.getDispatchSummary();
  }
}
