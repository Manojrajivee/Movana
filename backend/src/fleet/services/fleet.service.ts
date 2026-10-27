import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import {
  FleetRepository,
  VehicleEntity,
  VehicleTypeEntity,
  VehicleModelEntity,
  VehicleManufacturerEntity,
} from '../repositories/fleet.repository';
import { CreateVehicleDto } from '../dto/create-vehicle.dto';
import { UpdateVehicleDto } from '../dto/update-vehicle.dto';
import { UpdateVehicleStatusDto } from '../dto/update-vehicle-status.dto';
import { UpdateVehicleTelemetryDto } from '../dto/update-vehicle-telemetry.dto';
import { QueryVehiclesDto } from '../dto/query-vehicles.dto';
import { AuthenticatedUser } from '../../auth/decorators/current-user.decorator';

@Injectable()
export class FleetService {
  constructor(
    private readonly db: DatabaseService,
    private readonly fleetRepo: FleetRepository,
  ) {}

  async createVehicle(
    dto: CreateVehicleDto,
    _currentUser: AuthenticatedUser,
  ): Promise<VehicleEntity> {
    // 1. Verify reference entities exist
    const [vehicleType, manufacturer, model] = await Promise.all([
      this.fleetRepo.findVehicleTypeById(dto.vehicleTypeId),
      this.fleetRepo.findManufacturerById(dto.manufacturerId),
      this.fleetRepo.findVehicleModelById(dto.modelId),
    ]);

    if (!vehicleType) {
      throw new NotFoundException(`Vehicle classification type [${dto.vehicleTypeId}] not found`);
    }
    if (!manufacturer) {
      throw new NotFoundException(`Vehicle manufacturer [${dto.manufacturerId}] not found`);
    }
    if (!model) {
      throw new NotFoundException(`Vehicle model [${dto.modelId}] not found`);
    }

    if (model.manufacturer_id !== dto.manufacturerId) {
      throw new BadRequestException(
        `Model [${model.name}] does not belong to manufacturer [${manufacturer.name}]`,
      );
    }

    // 2. Verify uniqueness
    const [existingReg, existingCode, existingVin] = await Promise.all([
      this.fleetRepo.findVehicleByRegistrationNumber(dto.registrationNumber),
      this.fleetRepo.findVehicleByCode(dto.vehicleCode),
      this.fleetRepo.findVehicleByVin(dto.vin),
    ]);

    if (existingReg) {
      throw new ConflictException(
        `Registration number [${dto.registrationNumber}] is already registered`,
      );
    }
    if (existingCode) {
      throw new ConflictException(`Vehicle code [${dto.vehicleCode}] is already in use`);
    }
    if (existingVin) {
      throw new ConflictException(`Vehicle VIN [${dto.vin}] is already registered`);
    }

    // 3. Invariant check: total capacity = seat + standing
    const standing = dto.standingCapacity ?? 0;
    const computedCapacity = dto.capacity ?? dto.seatCapacity + standing;
    if (computedCapacity !== dto.seatCapacity + standing) {
      throw new BadRequestException(
        'Total capacity must equal seat capacity plus standing capacity',
      );
    }

    return this.fleetRepo.createVehicle({
      registrationNumber: dto.registrationNumber,
      vehicleCode: dto.vehicleCode,
      vehicleTypeId: dto.vehicleTypeId,
      manufacturerId: dto.manufacturerId,
      modelId: dto.modelId,
      modelYear: dto.modelYear,
      vin: dto.vin,
      engineNumber: dto.engineNumber,
      capacity: computedCapacity,
      standingCapacity: standing,
      seatCapacity: dto.seatCapacity,
      fuelType: dto.fuelType,
      currentOdometer: dto.currentOdometer,
    });
  }

  async getVehicles(
    query: QueryVehiclesDto,
  ): Promise<{ vehicles: VehicleEntity[]; total: number }> {
    return this.fleetRepo.findVehicles({
      status: query.status,
      vehicleTypeId: query.vehicleTypeId,
      manufacturerId: query.manufacturerId,
      modelId: query.modelId,
      fuelType: query.fuelType,
      search: query.search,
      limit: query.limit,
      offset: query.offset,
    });
  }

  async getVehicleById(id: string): Promise<VehicleEntity> {
    const vehicle = await this.fleetRepo.findVehicleById(id);
    if (!vehicle) {
      throw new NotFoundException(`Vehicle with ID [${id}] not found`);
    }
    return vehicle;
  }

  async updateVehicle(
    id: string,
    dto: UpdateVehicleDto,
    _currentUser: AuthenticatedUser,
  ): Promise<VehicleEntity> {
    const vehicle = await this.fleetRepo.findVehicleById(id);
    if (!vehicle) {
      throw new NotFoundException(`Vehicle with ID [${id}] not found`);
    }

    if (vehicle.status === 'DECOMMISSIONED') {
      throw new BadRequestException('Cannot modify a decommissioned vehicle');
    }

    if (dto.vehicleTypeId) {
      const type = await this.fleetRepo.findVehicleTypeById(dto.vehicleTypeId);
      if (!type) {
        throw new NotFoundException(`Vehicle classification type [${dto.vehicleTypeId}] not found`);
      }
    }

    const effectiveSeat = dto.seatCapacity ?? vehicle.seat_capacity;
    const effectiveStanding = dto.standingCapacity ?? vehicle.standing_capacity;
    const effectiveTotal = dto.capacity ?? effectiveSeat + effectiveStanding;

    if (effectiveTotal !== effectiveSeat + effectiveStanding) {
      throw new BadRequestException(
        'Total capacity must equal seat capacity plus standing capacity',
      );
    }

    const updated = await this.fleetRepo.updateVehicle(id, {
      vehicleTypeId: dto.vehicleTypeId,
      seatCapacity: effectiveSeat,
      standingCapacity: effectiveStanding,
      capacity: effectiveTotal,
      fuelType: dto.fuelType,
      currentOdometer: dto.currentOdometer,
    });

    if (!updated) {
      throw new NotFoundException(`Vehicle with ID [${id}] not found`);
    }

    return updated;
  }

  async updateVehicleStatus(
    id: string,
    dto: UpdateVehicleStatusDto,
    currentUser: AuthenticatedUser,
  ): Promise<VehicleEntity> {
    const vehicle = await this.fleetRepo.findVehicleById(id);
    if (!vehicle) {
      throw new NotFoundException(`Vehicle with ID [${id}] not found`);
    }

    if (vehicle.status === 'DECOMMISSIONED') {
      throw new BadRequestException(
        'Cannot transition status from DECOMMISSIONED (terminal state)',
      );
    }

    if (vehicle.status === dto.status) {
      return vehicle;
    }

    return this.db.withTransaction(async (client) => {
      const updated = await this.fleetRepo.updateVehicleStatus(id, dto.status, client);
      if (!updated) {
        throw new NotFoundException(`Vehicle with ID [${id}] not found`);
      }

      await this.fleetRepo.recordStatusHistory(
        id,
        vehicle.status,
        dto.status,
        dto.reason ?? null,
        currentUser.id,
        client,
      );

      return updated;
    });
  }

  async updateVehicleTelemetry(id: string, dto: UpdateVehicleTelemetryDto): Promise<VehicleEntity> {
    const vehicle = await this.fleetRepo.findVehicleById(id);
    if (!vehicle) {
      throw new NotFoundException(`Vehicle with ID [${id}] not found`);
    }

    const updated = await this.fleetRepo.updateTelemetry(
      id,
      dto.latitude,
      dto.longitude,
      dto.odometer,
    );

    if (!updated) {
      throw new NotFoundException(`Vehicle with ID [${id}] not found`);
    }

    return updated;
  }

  async deleteVehicle(id: string, currentUser: AuthenticatedUser): Promise<void> {
    const vehicle = await this.fleetRepo.findVehicleById(id);
    if (!vehicle) {
      throw new NotFoundException(`Vehicle with ID [${id}] not found`);
    }

    await this.db.withTransaction(async (client) => {
      await this.fleetRepo.softDeleteVehicle(id, client);
      await this.fleetRepo.recordStatusHistory(
        id,
        vehicle.status,
        'DECOMMISSIONED',
        'Vehicle retired and soft-deleted from active fleet registry',
        currentUser.id,
        client,
      );
    });
  }

  async getVehicleTypes(): Promise<VehicleTypeEntity[]> {
    return this.fleetRepo.findVehicleTypes();
  }

  async getVehicleModels(manufacturerId?: string): Promise<VehicleModelEntity[]> {
    return this.fleetRepo.findVehicleModels(manufacturerId);
  }

  async getManufacturers(): Promise<VehicleManufacturerEntity[]> {
    return this.fleetRepo.findManufacturers();
  }
}
