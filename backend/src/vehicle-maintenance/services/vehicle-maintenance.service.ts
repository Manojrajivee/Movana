import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import {
  VehicleMaintenanceRepository,
  MaintenanceScheduleEntity,
  MaintenanceRecordEntity,
  VehicleInspectionEntity,
} from '../repositories/vehicle-maintenance.repository';
import { FleetRepository } from '../../fleet/repositories/fleet.repository';
import { CreateMaintenanceScheduleDto } from '../dto/create-maintenance-schedule.dto';
import { CreateMaintenanceRecordDto } from '../dto/create-maintenance-record.dto';
import { UpdateMaintenanceStatusDto } from '../dto/update-maintenance-status.dto';
import { CreateVehicleInspectionDto } from '../dto/create-vehicle-inspection.dto';
import {
  QueryMaintenanceSchedulesDto,
  QueryMaintenanceRecordsDto,
  QueryVehicleInspectionsDto,
} from '../dto/query-maintenance.dto';
import { AuthenticatedUser } from '../../auth/decorators/current-user.decorator';

@Injectable()
export class VehicleMaintenanceService {
  constructor(
    private readonly maintRepo: VehicleMaintenanceRepository,
    private readonly fleetRepo: FleetRepository,
    private readonly db: DatabaseService,
  ) {}

  // 1. Maintenance Schedules
  async createSchedule(
    dto: CreateMaintenanceScheduleDto,
    _currentUser: AuthenticatedUser,
  ): Promise<MaintenanceScheduleEntity> {
    if (dto.vehicleId) {
      const vehicle = await this.fleetRepo.findVehicleById(dto.vehicleId);
      if (!vehicle) {
        throw new NotFoundException(`Vehicle with ID [${dto.vehicleId}] not found`);
      }
    }
    if (dto.vehicleTypeId) {
      const vtype = await this.fleetRepo.findVehicleTypeById(dto.vehicleTypeId);
      if (!vtype) {
        throw new NotFoundException(`Vehicle type with ID [${dto.vehicleTypeId}] not found`);
      }
    }

    return this.maintRepo.createSchedule({
      serviceName: dto.serviceName,
      vehicleTypeId: dto.vehicleTypeId,
      vehicleId: dto.vehicleId,
      intervalKm: dto.intervalKm,
      intervalDays: dto.intervalDays,
      description: dto.description,
      isActive: dto.isActive,
    });
  }

  async getSchedules(
    query: QueryMaintenanceSchedulesDto,
    _currentUser: AuthenticatedUser,
  ): Promise<MaintenanceScheduleEntity[]> {
    return this.maintRepo.findSchedules(query);
  }

  async getScheduleById(
    id: string,
    _currentUser: AuthenticatedUser,
  ): Promise<MaintenanceScheduleEntity> {
    const schedule = await this.maintRepo.findScheduleById(id);
    if (!schedule) {
      throw new NotFoundException(`Maintenance schedule with ID [${id}] not found`);
    }
    return schedule;
  }

  // 2. Maintenance Records / Work Orders
  async createRecord(
    dto: CreateMaintenanceRecordDto,
    _currentUser: AuthenticatedUser,
  ): Promise<MaintenanceRecordEntity> {
    const vehicle = await this.fleetRepo.findVehicleById(dto.vehicleId);
    if (!vehicle) {
      throw new NotFoundException(`Vehicle with ID [${dto.vehicleId}] not found`);
    }

    return this.maintRepo.createRecord({
      vehicleId: dto.vehicleId,
      maintenanceType: dto.maintenanceType,
      scheduledDate: dto.scheduledDate,
      odometer: dto.odometer,
      cost: dto.cost,
      currency: dto.currency,
      vendor: dto.vendor,
      description: dto.description,
      technician: dto.technician,
      nextDueDate: dto.nextDueDate,
    });
  }

  async getRecords(
    query: QueryMaintenanceRecordsDto,
    _currentUser: AuthenticatedUser,
  ): Promise<{ records: MaintenanceRecordEntity[]; total: number }> {
    return this.maintRepo.findRecords(query);
  }

  async getRecordById(
    id: string,
    _currentUser: AuthenticatedUser,
  ): Promise<MaintenanceRecordEntity> {
    const record = await this.maintRepo.findRecordById(id);
    if (!record) {
      throw new NotFoundException(`Maintenance record with ID [${id}] not found`);
    }
    return record;
  }

  async updateRecordStatus(
    id: string,
    dto: UpdateMaintenanceStatusDto,
    currentUser: AuthenticatedUser,
  ): Promise<MaintenanceRecordEntity> {
    const record = await this.maintRepo.findRecordById(id);
    if (!record) {
      throw new NotFoundException(`Maintenance record with ID [${id}] not found`);
    }

    if (record.status === 'COMPLETED' || record.status === 'CANCELLED') {
      throw new BadRequestException(
        `Cannot change status of a terminal maintenance record (current status: ${record.status})`,
      );
    }

    if (dto.status === 'IN_PROGRESS' && record.status !== 'SCHEDULED') {
      throw new BadRequestException(
        `Cannot start maintenance work for record in [${record.status}] status`,
      );
    }

    if (dto.status === 'COMPLETED' && record.status !== 'IN_PROGRESS') {
      throw new BadRequestException(
        `Cannot complete maintenance work that is not IN_PROGRESS (current status: ${record.status})`,
      );
    }

    const today = new Date().toISOString().split('T')[0];

    return this.db.withTransaction(async (client) => {
      const updated = await this.maintRepo.updateRecordStatus(
        id,
        dto.status,
        dto.status === 'COMPLETED' ? today : undefined,
        client,
      );
      if (!updated) {
        throw new NotFoundException(`Failed to update maintenance record [${id}]`);
      }

      // If work begins (IN_PROGRESS), transition vehicle to MAINTENANCE
      if (dto.status === 'IN_PROGRESS') {
        const vehicle = await this.fleetRepo.findVehicleById(record.vehicle_id, client);
        if (vehicle && vehicle.status === 'ACTIVE') {
          await this.fleetRepo.updateVehicleStatus(vehicle.id, 'MAINTENANCE', client);
          await this.fleetRepo.recordStatusHistory(
            vehicle.id,
            vehicle.status,
            'MAINTENANCE',
            `Maintenance work order [${id}] started`,
            currentUser.id,
            client,
          );
        }
      }

      // If work completes (COMPLETED), transition vehicle back to ACTIVE
      if (dto.status === 'COMPLETED') {
        const vehicle = await this.fleetRepo.findVehicleById(record.vehicle_id, client);
        if (vehicle && vehicle.status === 'MAINTENANCE') {
          await this.fleetRepo.updateVehicleStatus(vehicle.id, 'ACTIVE', client);
          await this.fleetRepo.recordStatusHistory(
            vehicle.id,
            vehicle.status,
            'ACTIVE',
            `Maintenance work order [${id}] completed`,
            currentUser.id,
            client,
          );
        }
      }

      return updated;
    });
  }

  // 3. Vehicle Inspections
  async createInspection(
    dto: CreateVehicleInspectionDto,
    currentUser: AuthenticatedUser,
  ): Promise<VehicleInspectionEntity> {
    const vehicle = await this.fleetRepo.findVehicleById(dto.vehicleId);
    if (!vehicle) {
      throw new NotFoundException(`Vehicle with ID [${dto.vehicleId}] not found`);
    }

    return this.db.withTransaction(async (client) => {
      const inspection = await this.maintRepo.createInspection(
        {
          vehicleId: dto.vehicleId,
          inspectionType: dto.inspectionType,
          inspectorId: currentUser.id,
          tripId: dto.tripId,
          status: dto.status,
          odometer: dto.odometer,
          notes: dto.notes,
        },
        client,
      );

      // If safety inspection failed, mark vehicle as MAINTENANCE immediately
      if (dto.status === 'FAILED' || dto.status === 'NEEDS_REPAIR') {
        if (vehicle.status === 'ACTIVE') {
          await this.fleetRepo.updateVehicleStatus(vehicle.id, 'MAINTENANCE', client);
          await this.fleetRepo.recordStatusHistory(
            vehicle.id,
            vehicle.status,
            'MAINTENANCE',
            `Vehicle failed ${dto.inspectionType} inspection: ${dto.notes ?? 'Defects found'}`,
            currentUser.id,
            client,
          );
        }
      }

      // Update vehicle odometer if reading is higher
      if (Number(dto.odometer) > Number(vehicle.current_odometer)) {
        await client.query(
          `
          UPDATE vehicles
          SET current_odometer = $1, updated_at = CURRENT_TIMESTAMP
          WHERE id = $2
          `,
          [dto.odometer, vehicle.id],
        );
      }

      return inspection;
    });
  }

  async getInspections(
    query: QueryVehicleInspectionsDto,
    _currentUser: AuthenticatedUser,
  ): Promise<{ inspections: VehicleInspectionEntity[]; total: number }> {
    return this.maintRepo.findInspections(query);
  }

  async getInspectionById(
    id: string,
    _currentUser: AuthenticatedUser,
  ): Promise<VehicleInspectionEntity> {
    const inspection = await this.maintRepo.findInspectionById(id);
    if (!inspection) {
      throw new NotFoundException(`Vehicle inspection with ID [${id}] not found`);
    }
    return inspection;
  }
}
