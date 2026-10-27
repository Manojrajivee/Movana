import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CreateBusDeviceDto } from '../dto/create-bus-device.dto';
import { PairBusDeviceDto } from '../dto/pair-bus-device.dto';
import { QueryBusDevicesDto } from '../dto/query-bus-devices.dto';
import { UpdateBusDeviceDto } from '../dto/update-bus-device.dto';
import { BusDevicesRepository, TrackingDeviceEntity } from '../repositories/bus-devices.repository';

@Injectable()
export class BusDevicesService {
  private readonly logger = new Logger(BusDevicesService.name);

  constructor(private readonly repo: BusDevicesRepository) {}

  async createDevice(dto: CreateBusDeviceDto): Promise<TrackingDeviceEntity> {
    const existing = await this.repo.findByImei(dto.deviceImei);
    if (existing) {
      throw new ConflictException(`Device with IMEI '${dto.deviceImei}' is already registered`);
    }

    if (dto.vehicleId) {
      const vehicle = await this.repo.findVehicleById(dto.vehicleId);
      if (!vehicle) {
        throw new NotFoundException(`Vehicle with ID '${dto.vehicleId}' not found`);
      }
      if (vehicle.status === 'DECOMMISSIONED') {
        throw new BadRequestException('Cannot assign tracking device to a decommissioned vehicle');
      }

      const activePairing = await this.repo.findActiveByVehicleId(dto.vehicleId);
      if (activePairing) {
        throw new ConflictException(
          `Vehicle '${dto.vehicleId}' already has an active tracking device paired (IMEI: ${activePairing.device_imei})`,
        );
      }
    }

    this.logger.log(
      `Registering tracking device IMEI: ${dto.deviceImei}, Model: ${dto.deviceModel}`,
    );
    return this.repo.createDevice({
      deviceImei: dto.deviceImei,
      deviceModel: dto.deviceModel,
      firmwareVersion: dto.firmwareVersion,
      vehicleId: dto.vehicleId,
      isActive: dto.isActive,
    });
  }

  async getDevices(query: QueryBusDevicesDto) {
    return this.repo.findAll({
      vehicleId: query.vehicleId,
      isActive: query.isActive,
      search: query.search,
      limit: query.limit,
      offset: query.offset,
    });
  }

  async getDeviceById(id: string): Promise<TrackingDeviceEntity> {
    const device = await this.repo.findById(id);
    if (!device) {
      throw new NotFoundException(`Tracking device with ID '${id}' not found`);
    }
    return device;
  }

  async updateDevice(id: string, dto: UpdateBusDeviceDto): Promise<TrackingDeviceEntity> {
    await this.getDeviceById(id);
    const updated = await this.repo.updateDevice(id, dto);
    if (!updated) {
      throw new NotFoundException(`Tracking device with ID '${id}' not found`);
    }
    return updated;
  }

  async pairDevice(id: string, dto: PairBusDeviceDto): Promise<TrackingDeviceEntity> {
    const device = await this.getDeviceById(id);
    if (!device.is_active) {
      throw new BadRequestException('Cannot pair an inactive tracking device');
    }

    const vehicle = await this.repo.findVehicleById(dto.vehicleId);
    if (!vehicle) {
      throw new NotFoundException(`Vehicle with ID '${dto.vehicleId}' not found`);
    }
    if (vehicle.status === 'DECOMMISSIONED') {
      throw new BadRequestException('Cannot assign tracking device to a decommissioned vehicle');
    }

    const activePairing = await this.repo.findActiveByVehicleId(dto.vehicleId);
    if (activePairing && activePairing.id !== id) {
      throw new ConflictException(
        `Vehicle '${dto.vehicleId}' already has an active tracking device paired (IMEI: ${activePairing.device_imei})`,
      );
    }

    this.logger.log(
      `Pairing device ${id} (IMEI: ${device.device_imei}) to vehicle ${dto.vehicleId}`,
    );
    const paired = await this.repo.pairDevice(id, dto.vehicleId);
    if (!paired) {
      throw new NotFoundException(`Tracking device with ID '${id}' not found`);
    }
    return paired;
  }

  async unpairDevice(id: string): Promise<TrackingDeviceEntity> {
    const device = await this.getDeviceById(id);
    if (!device.vehicle_id) {
      throw new BadRequestException('Tracking device is not currently paired to any vehicle');
    }

    this.logger.log(`Unpairing device ${id} from vehicle ${device.vehicle_id}`);
    const unpaired = await this.repo.unpairDevice(id);
    if (!unpaired) {
      throw new NotFoundException(`Tracking device with ID '${id}' not found`);
    }
    return unpaired;
  }

  async decommissionDevice(id: string): Promise<TrackingDeviceEntity> {
    await this.getDeviceById(id);
    this.logger.log(`Decommissioning tracking device ${id}`);
    const decommissioned = await this.repo.decommissionDevice(id);
    if (!decommissioned) {
      throw new NotFoundException(`Tracking device with ID '${id}' not found`);
    }
    return decommissioned;
  }

  async getDeviceStatus(id: string) {
    const device = await this.getDeviceById(id);
    let latestTelemetry: {
      latitude: number;
      longitude: number;
      speed_kmh: number;
      recorded_at: Date;
    } | null = null;

    if (device.vehicle_id) {
      latestTelemetry = await this.repo.getLatestTelemetry(device.vehicle_id);
    }

    return {
      deviceId: device.id,
      imei: device.device_imei,
      model: device.device_model,
      firmwareVersion: device.firmware_version,
      isActive: device.is_active,
      isPaired: !!device.vehicle_id,
      installedAt: device.installed_at,
      pairedVehicle: device.vehicle_id
        ? {
            id: device.vehicle_id,
            code: device.vehicle_code,
            registrationNumber: device.registration_number,
            status: device.vehicle_status,
          }
        : null,
      latestTelemetry: latestTelemetry
        ? {
            latitude: Number(latestTelemetry.latitude),
            longitude: Number(latestTelemetry.longitude),
            speedKmh: Number(latestTelemetry.speed_kmh),
            recordedAt: latestTelemetry.recorded_at,
          }
        : null,
    };
  }
}
