import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import {
  FleetOperationsRepository,
  VehicleAssignmentEntity,
  VehicleStatusHistoryEntity,
  FleetSummaryStats,
} from '../repositories/fleet-operations.repository';
import { FleetRepository } from '../../fleet/repositories/fleet.repository';
import { DriversRepository } from '../../drivers/repositories/drivers.repository';
import { CreateVehicleAssignmentDto } from '../dto/create-vehicle-assignment.dto';
import { QueryVehicleAssignmentsDto } from '../dto/query-vehicle-assignments.dto';
import { UpdateVehicleAssignmentStatusDto } from '../dto/update-vehicle-assignment-status.dto';
import { AuthenticatedUser } from '../../auth/decorators/current-user.decorator';

export interface VehicleReadinessResult {
  vehicleId: string;
  vehicleCode: string;
  registrationNumber: string;
  status: string;
  isReady: boolean;
  currentAssignment: {
    id: string;
    driverId: string;
    status: string;
    startAt: Date;
    endAt: Date | null;
  } | null;
  reasons: string[];
}

@Injectable()
export class FleetOperationsService {
  constructor(
    private readonly fleetOpsRepo: FleetOperationsRepository,
    private readonly fleetRepo: FleetRepository,
    private readonly driversRepo: DriversRepository,
    private readonly db: DatabaseService,
  ) {}

  private isElevatedRole(user: AuthenticatedUser): boolean {
    const elevatedRoles = ['ADMIN', 'OPERATOR', 'FLEET_MANAGER', 'SAFETY_OFFICER'];
    return user.roles.some((r) => elevatedRoles.includes(r));
  }

  async createAssignment(
    dto: CreateVehicleAssignmentDto,
    currentUser: AuthenticatedUser,
  ): Promise<VehicleAssignmentEntity> {
    // 1. Verify vehicle exists and is operational
    const vehicle = await this.fleetRepo.findVehicleById(dto.vehicleId);
    if (!vehicle) {
      throw new NotFoundException(`Vehicle with ID [${dto.vehicleId}] not found`);
    }
    if (vehicle.deleted_at) {
      throw new BadRequestException('Cannot assign a decommissioned vehicle');
    }
    if (vehicle.status !== 'ACTIVE') {
      throw new BadRequestException(
        `Cannot dispatch vehicle with non-active status [${vehicle.status}]`,
      );
    }

    // 2. Verify driver exists and is compliant
    const driver = await this.driversRepo.findById(dto.driverId);
    if (!driver) {
      throw new NotFoundException(`Driver with ID [${dto.driverId}] not found`);
    }
    if (driver.employmentStatus !== 'ACTIVE') {
      throw new BadRequestException(
        `Driver [${driver.employeeCode}] is not in ACTIVE employment status (current: ${driver.employmentStatus})`,
      );
    }
    if (driver.verificationStatus !== 'VERIFIED') {
      throw new BadRequestException(
        `Driver [${driver.employeeCode}] does not have VERIFIED compliance documents (current: ${driver.verificationStatus})`,
      );
    }
    const today = new Date().toISOString().split('T')[0];
    if (driver.licenseExpiryDate < today) {
      throw new BadRequestException(
        `Driver commercial license has expired on ${driver.licenseExpiryDate}`,
      );
    }

    // 3. Check vehicle scheduling conflicts
    const vehicleConflict = await this.fleetOpsRepo.findConflictingVehicleAssignment(
      dto.vehicleId,
      dto.startAt,
      dto.endAt ?? null,
    );
    if (vehicleConflict) {
      throw new ConflictException(
        `Vehicle [${vehicle.registration_number}] is already assigned to another shift between ${vehicleConflict.start_at} and ${vehicleConflict.end_at ?? 'open-ended'}`,
      );
    }

    // 4. Execute atomic transaction (insert vehicle_assignment + sync to driver_assignments)
    return this.db.withTransaction(async (client) => {
      const assignment = await this.fleetOpsRepo.createVehicleAssignment(
        {
          vehicleId: dto.vehicleId,
          driverId: dto.driverId,
          tripId: dto.tripId,
          assignmentType: dto.assignmentType,
          startAt: dto.startAt,
          endAt: dto.endAt,
          assignedBy: currentUser.id,
        },
        client,
      );

      // Sync to driver_assignments for cross-module operational continuity
      await client.query(
        `
        INSERT INTO driver_assignments (
          driver_id, vehicle_id, trip_id, assignment_type, start_at, end_at, status, assigned_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'SCHEDULED', $7)
        `,
        [
          dto.driverId,
          dto.vehicleId,
          dto.tripId ?? null,
          dto.assignmentType,
          dto.startAt,
          dto.endAt ?? null,
          currentUser.id,
        ],
      );

      return assignment;
    });
  }

  async getAssignments(
    query: QueryVehicleAssignmentsDto,
    currentUser: AuthenticatedUser,
  ): Promise<{ assignments: VehicleAssignmentEntity[]; total: number }> {
    let effectiveDriverId = query.driverId;

    if (!this.isElevatedRole(currentUser)) {
      const driver = await this.driversRepo.findByUserId(currentUser.id);
      if (!driver) {
        return { assignments: [], total: 0 };
      }
      effectiveDriverId = driver.id;
    }

    return this.fleetOpsRepo.findAssignments({
      vehicleId: query.vehicleId,
      driverId: effectiveDriverId,
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
  ): Promise<VehicleAssignmentEntity> {
    const assignment = await this.fleetOpsRepo.findAssignmentById(id);
    if (!assignment) {
      throw new NotFoundException(`Vehicle assignment with ID [${id}] not found`);
    }

    if (!this.isElevatedRole(currentUser)) {
      const driver = await this.driversRepo.findByUserId(currentUser.id);
      if (!driver || assignment.driver_id !== driver.id) {
        throw new ForbiddenException(
          'Access denied: cannot view another driver vehicle assignment',
        );
      }
    }

    return assignment;
  }

  async updateAssignmentStatus(
    id: string,
    dto: UpdateVehicleAssignmentStatusDto,
    currentUser: AuthenticatedUser,
  ): Promise<VehicleAssignmentEntity> {
    const assignment = await this.fleetOpsRepo.findAssignmentById(id);
    if (!assignment) {
      throw new NotFoundException(`Vehicle assignment with ID [${id}] not found`);
    }

    // Role check and permissions
    if (!this.isElevatedRole(currentUser)) {
      const driver = await this.driversRepo.findByUserId(currentUser.id);
      if (!driver || assignment.driver_id !== driver.id) {
        throw new ForbiddenException(
          'Access denied: cannot modify another driver vehicle assignment',
        );
      }
      if (dto.status === 'CANCELLED') {
        throw new ForbiddenException(
          'Drivers are not authorized to cancel vehicle assignments; please contact dispatch',
        );
      }
    }

    // State machine transitions:
    // SCHEDULED -> ACTIVE or CANCELLED
    // ACTIVE -> COMPLETED or CANCELLED
    // COMPLETED / CANCELLED are terminal
    if (assignment.status === 'COMPLETED' || assignment.status === 'CANCELLED') {
      throw new BadRequestException(
        `Cannot change status of a terminal assignment (current status: ${assignment.status})`,
      );
    }

    if (dto.status === 'ACTIVE' && assignment.status !== 'SCHEDULED') {
      throw new BadRequestException(
        `Cannot activate assignment that is currently in [${assignment.status}] status`,
      );
    }

    if (dto.status === 'COMPLETED' && assignment.status !== 'ACTIVE') {
      throw new BadRequestException(
        `Cannot complete assignment that is not currently ACTIVE (current status: ${assignment.status})`,
      );
    }

    return this.db.withTransaction(async (client) => {
      const updated = await this.fleetOpsRepo.updateAssignmentStatus(id, dto.status, client);
      if (!updated) {
        throw new NotFoundException(`Failed to update vehicle assignment [${id}]`);
      }

      // Sync status to matching driver_assignment if exists
      await client.query(
        `
        UPDATE driver_assignments
        SET status = $1, updated_at = CURRENT_TIMESTAMP
        WHERE vehicle_id = $2 AND driver_id = $3 AND start_at = $4
        `,
        [dto.status, assignment.vehicle_id, assignment.driver_id, assignment.start_at],
      );

      return updated;
    });
  }

  async getVehicleReadiness(
    vehicleId: string,
    _currentUser: AuthenticatedUser,
  ): Promise<VehicleReadinessResult> {
    const vehicle = await this.fleetRepo.findVehicleById(vehicleId);
    if (!vehicle) {
      throw new NotFoundException(`Vehicle with ID [${vehicleId}] not found`);
    }

    const reasons: string[] = [];
    if (vehicle.deleted_at) {
      reasons.push('Vehicle is decommissioned');
    }
    if (vehicle.status !== 'ACTIVE') {
      reasons.push(`Vehicle operational status is ${vehicle.status}`);
    }

    const activeAssignment = await this.fleetOpsRepo.getActiveVehicleAssignment(vehicleId);
    if (activeAssignment) {
      reasons.push(
        `Vehicle is currently dispatched on an active assignment (${activeAssignment.id})`,
      );
    }

    return {
      vehicleId: vehicle.id,
      vehicleCode: vehicle.vehicle_code,
      registrationNumber: vehicle.registration_number,
      status: vehicle.status,
      isReady: reasons.length === 0,
      currentAssignment: activeAssignment
        ? {
            id: activeAssignment.id,
            driverId: activeAssignment.driver_id,
            status: activeAssignment.status,
            startAt: activeAssignment.start_at,
            endAt: activeAssignment.end_at,
          }
        : null,
      reasons,
    };
  }

  async getVehicleStatusHistory(
    vehicleId: string,
    limit: number,
    offset: number,
    _currentUser: AuthenticatedUser,
  ): Promise<{ history: VehicleStatusHistoryEntity[]; total: number }> {
    const vehicle = await this.fleetRepo.findVehicleById(vehicleId);
    if (!vehicle) {
      throw new NotFoundException(`Vehicle with ID [${vehicleId}] not found`);
    }

    return this.fleetOpsRepo.findVehicleStatusHistory(vehicleId, limit, offset);
  }

  async getFleetSummary(_currentUser: AuthenticatedUser): Promise<FleetSummaryStats> {
    return this.fleetOpsRepo.getFleetSummary();
  }
}
