import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import {
  DriverOperationsRepository,
  DriverDutyAssignmentEntity,
  DriverSafetyEventEntity,
  DriverHoursSummary,
} from '../repositories/driver-operations.repository';
import { DriversRepository } from '../../drivers/repositories/drivers.repository';
import { FleetRepository } from '../../fleet/repositories/fleet.repository';
import { StartDutyDto } from '../dto/start-duty.dto';
import { EndDutyDto } from '../dto/end-duty.dto';
import { RecordSafetyEventDto } from '../dto/record-safety-event.dto';
import { QuerySafetyEventsDto } from '../dto/query-safety-events.dto';
import { QueryDutyHistoryDto } from '../dto/query-duty-history.dto';
import { AuthenticatedUser } from '../../auth/decorators/current-user.decorator';

export interface DutyEndResult {
  assignment: DriverDutyAssignmentEntity;
  durationHours: number;
  hoursExceeded: boolean;
  notes?: string;
}

@Injectable()
export class DriverOperationsService {
  constructor(
    private readonly driverOpsRepo: DriverOperationsRepository,
    private readonly driversRepo: DriversRepository,
    private readonly fleetRepo: FleetRepository,
    private readonly db: DatabaseService,
  ) {}

  private isElevatedRole(user: AuthenticatedUser): boolean {
    const elevatedRoles = ['ADMIN', 'OPERATOR', 'SAFETY_OFFICER', 'FLEET_MANAGER'];
    return user.roles.some((r) => elevatedRoles.includes(r));
  }

  async startDuty(
    dto: StartDutyDto,
    currentUser: AuthenticatedUser,
  ): Promise<DriverDutyAssignmentEntity> {
    const assignment = await this.driverOpsRepo.findAssignmentById(dto.assignmentId);
    if (!assignment) {
      throw new NotFoundException(`Assignment with ID [${dto.assignmentId}] not found`);
    }

    if (!this.isElevatedRole(currentUser)) {
      const driver = await this.driversRepo.findByUserId(currentUser.id);
      if (!driver || assignment.driver_id !== driver.id) {
        throw new ForbiddenException('Access denied: cannot start duty for another driver');
      }
    }

    if (assignment.status === 'ACTIVE') {
      return assignment;
    }

    if (assignment.status !== 'SCHEDULED') {
      throw new BadRequestException(
        `Cannot start duty for an assignment in [${assignment.status}] status`,
      );
    }

    // Check if driver currently has another active duty shift
    const existingActive = await this.driverOpsRepo.findActiveDutyAssignment(assignment.driver_id);
    if (existingActive && existingActive.id !== assignment.id) {
      throw new ConflictException(
        `Driver already has an active duty shift in progress (Assignment ID: ${existingActive.id})`,
      );
    }

    return this.db.withTransaction(async (client) => {
      const updated = await this.driverOpsRepo.updateDutyStatus(
        dto.assignmentId,
        'ACTIVE',
        undefined,
        client,
      );
      if (!updated) {
        throw new NotFoundException(
          `Failed to update duty status for assignment [${dto.assignmentId}]`,
        );
      }

      // Sync vehicle assignment status if vehicle is linked
      if (assignment.vehicle_id) {
        await client.query(
          `
          UPDATE vehicle_assignments
          SET status = 'ACTIVE', updated_at = CURRENT_TIMESTAMP
          WHERE vehicle_id = $1 AND driver_id = $2 AND status = 'SCHEDULED'
          `,
          [assignment.vehicle_id, assignment.driver_id],
        );
      }

      return updated;
    });
  }

  async endDuty(dto: EndDutyDto, currentUser: AuthenticatedUser): Promise<DutyEndResult> {
    const assignment = await this.driverOpsRepo.findAssignmentById(dto.assignmentId);
    if (!assignment) {
      throw new NotFoundException(`Assignment with ID [${dto.assignmentId}] not found`);
    }

    if (!this.isElevatedRole(currentUser)) {
      const driver = await this.driversRepo.findByUserId(currentUser.id);
      if (!driver || assignment.driver_id !== driver.id) {
        throw new ForbiddenException('Access denied: cannot end duty for another driver');
      }
    }

    if (assignment.status !== 'ACTIVE') {
      throw new BadRequestException(
        `Cannot end duty for an assignment that is not currently ACTIVE (current status: ${assignment.status})`,
      );
    }

    const now = new Date();
    const startTime = new Date(assignment.start_at).getTime();
    const durationHours = Math.round(((now.getTime() - startTime) / (1000 * 3600)) * 100) / 100;
    const hoursExceeded = durationHours > 10.0;

    const completedAssignment = await this.db.withTransaction(async (client) => {
      const updated = await this.driverOpsRepo.updateDutyStatus(
        dto.assignmentId,
        'COMPLETED',
        now,
        client,
      );
      if (!updated) {
        throw new NotFoundException(`Failed to complete assignment [${dto.assignmentId}]`);
      }

      // Sync vehicle assignment status if vehicle is linked
      if (assignment.vehicle_id) {
        await client.query(
          `
          UPDATE vehicle_assignments
          SET status = 'COMPLETED', end_at = $1, updated_at = CURRENT_TIMESTAMP
          WHERE vehicle_id = $2 AND driver_id = $3 AND status = 'ACTIVE'
          `,
          [now, assignment.vehicle_id, assignment.driver_id],
        );
      }

      // Automatic HOS violation logging if shift exceeded 10 hours
      if (hoursExceeded && assignment.vehicle_id) {
        await this.driverOpsRepo.createSafetyEvent(
          {
            driverId: assignment.driver_id,
            vehicleId: assignment.vehicle_id,
            tripId: assignment.trip_id,
            eventType: 'HOURS_EXCEEDED',
            severity: 'HIGH',
            occurredAt: now.toISOString(),
            eventData: {
              durationHours,
              permittedMaxHours: 10.0,
              assignmentId: assignment.id,
            },
          },
          client,
        );
      }

      return updated;
    });

    return {
      assignment: completedAssignment,
      durationHours,
      hoursExceeded,
      notes: dto.notes,
    };
  }

  async getCurrentDuty(
    driverId: string | undefined,
    currentUser: AuthenticatedUser,
  ): Promise<DriverDutyAssignmentEntity | null> {
    let effectiveDriverId = driverId;

    if (!this.isElevatedRole(currentUser)) {
      const driver = await this.driversRepo.findByUserId(currentUser.id);
      if (!driver) {
        return null;
      }
      effectiveDriverId = driver.id;
    }

    if (!effectiveDriverId) {
      throw new BadRequestException('Driver ID is required for operator duty queries');
    }

    return this.driverOpsRepo.findActiveDutyAssignment(effectiveDriverId);
  }

  async getDutyHistory(
    query: QueryDutyHistoryDto,
    currentUser: AuthenticatedUser,
  ): Promise<{
    history: DriverDutyAssignmentEntity[];
    total: number;
    summary: DriverHoursSummary;
  }> {
    let effectiveDriverId = query.driverId;

    if (!this.isElevatedRole(currentUser)) {
      const driver = await this.driversRepo.findByUserId(currentUser.id);
      if (!driver) {
        return {
          history: [],
          total: 0,
          summary: {
            driver_id: '',
            hours_last_24h: 0,
            hours_last_7d: 0,
            total_completed_shifts: 0,
          },
        };
      }
      effectiveDriverId = driver.id;
    }

    if (!effectiveDriverId) {
      throw new BadRequestException('Driver ID is required to query duty history');
    }

    const [historyData, summary] = await Promise.all([
      this.driverOpsRepo.findDutyHistory(effectiveDriverId, {
        from: query.from,
        to: query.to,
        limit: query.limit,
        offset: query.offset,
      }),
      this.driverOpsRepo.getDriverHoursSummary(effectiveDriverId),
    ]);

    return {
      history: historyData.history,
      total: historyData.total,
      summary,
    };
  }

  async recordSafetyEvent(
    dto: RecordSafetyEventDto,
    _currentUser: AuthenticatedUser,
  ): Promise<DriverSafetyEventEntity> {
    const driver = await this.driversRepo.findById(dto.driverId);
    if (!driver) {
      throw new NotFoundException(`Driver with ID [${dto.driverId}] not found`);
    }

    const vehicle = await this.fleetRepo.findVehicleById(dto.vehicleId);
    if (!vehicle) {
      throw new NotFoundException(`Vehicle with ID [${dto.vehicleId}] not found`);
    }

    return this.driverOpsRepo.createSafetyEvent({
      driverId: dto.driverId,
      vehicleId: dto.vehicleId,
      tripId: dto.tripId,
      eventType: dto.eventType,
      severity: dto.severity,
      speedKmh: dto.speedKmh,
      latitude: dto.latitude,
      longitude: dto.longitude,
      eventData: dto.eventData,
      occurredAt: dto.occurredAt,
    });
  }

  async getSafetyEvents(
    query: QuerySafetyEventsDto,
    currentUser: AuthenticatedUser,
  ): Promise<{ events: DriverSafetyEventEntity[]; total: number }> {
    let effectiveDriverId = query.driverId;

    if (!this.isElevatedRole(currentUser)) {
      const driver = await this.driversRepo.findByUserId(currentUser.id);
      if (!driver) {
        return { events: [], total: 0 };
      }
      effectiveDriverId = driver.id;
    }

    return this.driverOpsRepo.findSafetyEvents({
      driverId: effectiveDriverId,
      vehicleId: query.vehicleId,
      eventType: query.eventType,
      severity: query.severity,
      from: query.from,
      to: query.to,
      limit: query.limit,
      offset: query.offset,
    });
  }
}
