import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { DriversRepository } from '../repositories/drivers.repository';
import {
  DriverAssignmentsRepository,
  DriverAssignmentEntity,
  DriverAvailabilityEntity,
} from '../repositories/driver-assignments.repository';
import { CreateDriverAssignmentDto } from '../dto/create-driver-assignment.dto';
import { UpdateAssignmentStatusDto } from '../dto/update-assignment-status.dto';
import { QueryAssignmentsDto } from '../dto/query-assignments.dto';
import { CreateDriverAvailabilityDto } from '../dto/create-driver-availability.dto';
import { AuthenticatedUser } from '../../auth/decorators/current-user.decorator';

@Injectable()
export class DriverAssignmentsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly driversRepo: DriversRepository,
    private readonly assignmentsRepo: DriverAssignmentsRepository,
  ) {}

  private isPrivilegedOperator(user: AuthenticatedUser): boolean {
    return user.roles.some((r) => ['ADMIN', 'OPERATOR', 'SAFETY_OFFICER'].includes(r));
  }

  async createAssignment(
    dto: CreateDriverAssignmentDto,
    currentUser: AuthenticatedUser,
  ): Promise<DriverAssignmentEntity> {
    // 1. Verify driver exists and is eligible
    const driver = await this.driversRepo.findById(dto.driverId);
    if (!driver) {
      throw new NotFoundException(`Driver with ID [${dto.driverId}] not found`);
    }

    if (driver.employmentStatus !== 'ACTIVE') {
      throw new BadRequestException(
        `Driver is not active for shift assignments (current status: ${driver.employmentStatus})`,
      );
    }

    if (driver.verificationStatus !== 'VERIFIED') {
      throw new BadRequestException(
        `Driver compliance documents are not fully verified (current status: ${driver.verificationStatus})`,
      );
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (new Date(driver.licenseExpiryDate) < today) {
      throw new BadRequestException('Driver commercial driving license has expired');
    }

    // 2. If vehicle provided, check validity
    if (dto.vehicleId) {
      const vehicleRes = await this.db.query<{ id: string; status: string }>(
        'SELECT id, status FROM vehicles WHERE id = $1',
        [dto.vehicleId],
      );
      if (vehicleRes.rows.length === 0) {
        throw new NotFoundException(`Vehicle with ID [${dto.vehicleId}] not found`);
      }
      if (vehicleRes.rows[0].status !== 'ACTIVE') {
        throw new BadRequestException(
          `Vehicle is not active for dispatch (current status: ${vehicleRes.rows[0].status})`,
        );
      }
    }

    // 3. Conflict detection: Check overlapping assignments for driver
    const driverConflict = await this.assignmentsRepo.findConflictingDriverAssignment(
      dto.driverId,
      dto.startAt,
      dto.endAt ?? null,
    );
    if (driverConflict) {
      throw new ConflictException(
        `Driver already has an active or scheduled duty assignment during this time interval (Assignment ID: ${driverConflict.id})`,
      );
    }

    // 4. Conflict detection: Check overlapping assignments for vehicle
    if (dto.vehicleId) {
      const vehicleConflict = await this.assignmentsRepo.findConflictingVehicleAssignment(
        dto.vehicleId,
        dto.startAt,
        dto.endAt ?? null,
      );
      if (vehicleConflict) {
        throw new ConflictException(
          `Vehicle already has an active or scheduled duty assignment during this time interval (Assignment ID: ${vehicleConflict.id})`,
        );
      }
    }

    // 5. Atomic creation in transaction
    return this.db.withTransaction(async (client) => {
      const assignment = await this.assignmentsRepo.createAssignment(
        {
          driverId: dto.driverId,
          vehicleId: dto.vehicleId,
          tripId: dto.tripId,
          assignmentType: dto.assignmentType,
          startAt: dto.startAt,
          endAt: dto.endAt,
          assignedBy: currentUser.id,
        },
        client,
      );

      // If vehicle assigned, mirror into vehicle_assignments for fleet dispatch continuity
      if (dto.vehicleId) {
        await client.query(
          `
          INSERT INTO vehicle_assignments (
            vehicle_id, driver_id, trip_id, assignment_type, start_at, end_at, status, assigned_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, 'SCHEDULED', $7)
          `,
          [
            dto.vehicleId,
            dto.driverId,
            dto.tripId ?? null,
            dto.assignmentType,
            dto.startAt,
            dto.endAt ?? null,
            currentUser.id,
          ],
        );
      }

      return assignment;
    });
  }

  async getAssignments(
    query: QueryAssignmentsDto,
    currentUser: AuthenticatedUser,
  ): Promise<{ assignments: DriverAssignmentEntity[]; total: number }> {
    let effectiveDriverId = query.driverId;

    if (!this.isPrivilegedOperator(currentUser)) {
      // Driver querying: must be own driver profile
      const driver = await this.driversRepo.findByUserId(currentUser.id);
      if (!driver) {
        return { assignments: [], total: 0 };
      }
      effectiveDriverId = driver.id;
    }

    return this.assignmentsRepo.findAssignments({
      driverId: effectiveDriverId,
      vehicleId: query.vehicleId,
      status: query.status,
      from: query.from,
      to: query.to,
      limit: query.limit,
      offset: query.offset,
    });
  }

  async getAssignmentById(
    id: string,
    currentUser: AuthenticatedUser,
  ): Promise<DriverAssignmentEntity> {
    const assignment = await this.assignmentsRepo.findAssignmentById(id);
    if (!assignment) {
      throw new NotFoundException(`Assignment with ID [${id}] not found`);
    }

    if (!this.isPrivilegedOperator(currentUser)) {
      const driver = await this.driversRepo.findByUserId(currentUser.id);
      if (!driver || driver.id !== assignment.driver_id) {
        throw new ForbiddenException('Access denied: cannot view another driver assignment');
      }
    }

    return assignment;
  }

  async updateAssignmentStatus(
    id: string,
    dto: UpdateAssignmentStatusDto,
    currentUser: AuthenticatedUser,
  ): Promise<DriverAssignmentEntity> {
    const assignment = await this.assignmentsRepo.findAssignmentById(id);
    if (!assignment) {
      throw new NotFoundException(`Assignment with ID [${id}] not found`);
    }

    if (assignment.status === 'COMPLETED' || assignment.status === 'CANCELLED') {
      throw new BadRequestException(
        `Cannot modify assignment in terminal status [${assignment.status}]`,
      );
    }

    // Validate state machine transitions
    const validTransitions: Record<string, string[]> = {
      SCHEDULED: ['ACTIVE', 'CANCELLED'],
      ACTIVE: ['COMPLETED', 'CANCELLED'],
    };

    const allowed = validTransitions[assignment.status] || [];
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(
        `Invalid status transition from [${assignment.status}] to [${dto.status}]`,
      );
    }

    // Role-based restrictions
    if (!this.isPrivilegedOperator(currentUser)) {
      const driver = await this.driversRepo.findByUserId(currentUser.id);
      if (!driver || driver.id !== assignment.driver_id) {
        throw new ForbiddenException('Access denied: cannot modify another driver assignment');
      }
      if (dto.status === 'CANCELLED') {
        throw new ForbiddenException(
          'Drivers are not authorized to cancel duty assignments; please notify an operator',
        );
      }
    }

    return this.db.withTransaction(async (client) => {
      const updated = await this.assignmentsRepo.updateAssignmentStatus(id, dto.status, client);
      if (!updated) {
        throw new NotFoundException(`Assignment with ID [${id}] not found`);
      }

      // Synchronize vehicle_assignments if linked
      if (assignment.vehicle_id) {
        await client.query(
          `
          UPDATE vehicle_assignments
          SET status = $1, updated_at = CURRENT_TIMESTAMP
          WHERE vehicle_id = $2 AND driver_id = $3 AND start_at = $4
          `,
          [dto.status, assignment.vehicle_id, assignment.driver_id, assignment.start_at],
        );
      }

      return updated;
    });
  }

  async createAvailability(
    driverId: string,
    dto: CreateDriverAvailabilityDto,
    currentUser: AuthenticatedUser,
  ): Promise<DriverAvailabilityEntity> {
    const driver = await this.driversRepo.findById(driverId);
    if (!driver) {
      throw new NotFoundException(`Driver with ID [${driverId}] not found`);
    }

    if (!this.isPrivilegedOperator(currentUser)) {
      const ownDriver = await this.driversRepo.findByUserId(currentUser.id);
      if (!ownDriver || ownDriver.id !== driverId) {
        throw new ForbiddenException('Access denied: cannot set availability for another driver');
      }
    }

    return this.assignmentsRepo.createAvailability(driverId, {
      dayOfWeek: dto.dayOfWeek,
      startTime: dto.startTime,
      endTime: dto.endTime,
      isAvailable: dto.isAvailable,
      effectiveDate: dto.effectiveDate,
    });
  }

  async getAvailability(
    driverId: string,
    currentUser: AuthenticatedUser,
  ): Promise<DriverAvailabilityEntity[]> {
    const driver = await this.driversRepo.findById(driverId);
    if (!driver) {
      throw new NotFoundException(`Driver with ID [${driverId}] not found`);
    }

    if (!this.isPrivilegedOperator(currentUser)) {
      const ownDriver = await this.driversRepo.findByUserId(currentUser.id);
      if (!ownDriver || ownDriver.id !== driverId) {
        throw new ForbiddenException('Access denied: cannot view availability for another driver');
      }
    }

    return this.assignmentsRepo.findAvailabilityByDriver(driverId);
  }

  async deleteAvailability(
    driverId: string,
    availId: string,
    currentUser: AuthenticatedUser,
  ): Promise<void> {
    const driver = await this.driversRepo.findById(driverId);
    if (!driver) {
      throw new NotFoundException(`Driver with ID [${driverId}] not found`);
    }

    if (!this.isPrivilegedOperator(currentUser)) {
      const ownDriver = await this.driversRepo.findByUserId(currentUser.id);
      if (!ownDriver || ownDriver.id !== driverId) {
        throw new ForbiddenException(
          'Access denied: cannot delete availability for another driver',
        );
      }
    }

    const deleted = await this.assignmentsRepo.deleteAvailability(availId, driverId);
    if (!deleted) {
      throw new NotFoundException(`Availability shift [${availId}] not found for this driver`);
    }
  }
}
