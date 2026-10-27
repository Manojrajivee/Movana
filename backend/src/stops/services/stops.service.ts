import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CreateStopDto } from '../dto/create-stop.dto';
import { NearbyStopsDto } from '../dto/nearby-stops.dto';
import { QueryStopsDto } from '../dto/query-stops.dto';
import { UpdateStopStatusDto } from '../dto/update-stop-status.dto';
import { UpdateStopDto } from '../dto/update-stop.dto';
import { StopEntity, StopsRepository } from '../repositories/stops.repository';

@Injectable()
export class StopsService {
  private readonly logger = new Logger(StopsService.name);

  constructor(private readonly repo: StopsRepository) {}

  async createStop(dto: CreateStopDto): Promise<StopEntity> {
    const existing = await this.repo.findByCode(dto.stopCode);
    if (existing) {
      throw new ConflictException(`Stop with code '${dto.stopCode}' already exists`);
    }

    this.logger.log(
      `Creating transit stop ${dto.stopCode}: ${dto.name} (${dto.city}, ${dto.state})`,
    );
    return this.repo.createStop({
      stopCode: dto.stopCode,
      name: dto.name,
      description: dto.description,
      address: dto.address,
      city: dto.city,
      state: dto.state,
      country: dto.country,
      postalCode: dto.postalCode,
      latitude: dto.latitude,
      longitude: dto.longitude,
      geofenceRadiusMeters: dto.geofenceRadiusMeters,
      status: dto.status,
    });
  }

  async getStops(query: QueryStopsDto) {
    return this.repo.findAll({
      city: query.city,
      state: query.state,
      status: query.status,
      search: query.search,
      limit: query.limit,
      offset: query.offset,
    });
  }

  async getNearbyStops(query: NearbyStopsDto): Promise<StopEntity[]> {
    this.logger.log(
      `Querying nearby stops around (${query.latitude}, ${query.longitude}) within ${query.radiusKm} km`,
    );
    return this.repo.findNearby(query.latitude, query.longitude, query.radiusKm, query.limit);
  }

  async getStopById(id: string): Promise<StopEntity> {
    const stop = await this.repo.findById(id);
    if (!stop) {
      throw new NotFoundException(`Stop with ID '${id}' not found`);
    }
    return stop;
  }

  async updateStop(id: string, dto: UpdateStopDto): Promise<StopEntity> {
    await this.getStopById(id);
    this.logger.log(`Updating stop details for ID '${id}'`);
    const updated = await this.repo.updateStop(id, dto);
    if (!updated) {
      throw new NotFoundException(`Stop with ID '${id}' not found`);
    }
    return updated;
  }

  async updateStopStatus(id: string, dto: UpdateStopStatusDto): Promise<StopEntity> {
    await this.getStopById(id);

    if (dto.status !== 'ACTIVE') {
      const activeRouteCount = await this.repo.countActiveRoutesUsingStop(id);
      if (activeRouteCount > 0) {
        throw new ConflictException(
          `Cannot change stop status to '${dto.status}': ${activeRouteCount} active route(s) depend on this stop as origin or destination`,
        );
      }
    }

    this.logger.log(`Updating stop '${id}' status to '${dto.status}'`);
    const updated = await this.repo.updateStatus(id, dto.status);
    if (!updated) {
      throw new NotFoundException(`Stop with ID '${id}' not found`);
    }
    return updated;
  }

  async deleteStop(id: string): Promise<StopEntity> {
    await this.getStopById(id);

    const activeRoutes = await this.repo.countActiveRoutesUsingStop(id);
    if (activeRoutes > 0) {
      throw new ConflictException(
        `Cannot delete stop '${id}': ${activeRoutes} active route(s) depend on this stop as origin or destination`,
      );
    }

    const routeStops = await this.repo.countRouteStopsUsingStop(id);
    if (routeStops > 0) {
      throw new ConflictException(
        `Cannot delete stop '${id}': intermediate route alignment(s) currently reference this stop`,
      );
    }

    this.logger.log(`Deleting stop with ID '${id}'`);
    const deleted = await this.repo.deleteStop(id);
    if (!deleted) {
      throw new NotFoundException(`Stop with ID '${id}' not found`);
    }
    return deleted;
  }
}
