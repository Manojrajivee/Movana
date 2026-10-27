import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';
import { NearbyVehiclesDto } from '../dto/nearby-vehicles.dto';
import { QueryTrackingVehiclesDto } from '../dto/query-tracking-vehicles.dto';
import {
  ActiveVehicleLocationEntity,
  TrackingRepository,
  TripCurrentStatusEntity,
} from '../repositories/tracking.repository';

@Injectable()
export class TrackingService {
  private readonly logger = new Logger(TrackingService.name);

  constructor(
    private readonly repo: TrackingRepository,
    private readonly redis: RedisService,
  ) {}

  async getActiveVehicles(params: QueryTrackingVehiclesDto) {
    return this.repo.findActiveVehicles(params);
  }

  async getVehicleTracking(vehicleId: string): Promise<ActiveVehicleLocationEntity> {
    const cacheKey = `tracking:vehicle:${vehicleId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (_e) {
        // Fallback to database query if cache parse fails
      }
    }

    const vehicle = await this.repo.findVehicleTrackingById(vehicleId);
    if (!vehicle) {
      throw new NotFoundException(`Tracking data for vehicle ID '${vehicleId}' not found`);
    }

    // Cache latest position for 10 seconds
    await this.redis.set(cacheKey, JSON.stringify(vehicle), 10);
    return vehicle;
  }

  async getTripTracking(tripId: string): Promise<TripCurrentStatusEntity> {
    const cacheKey = `tracking:trip:${tripId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (_e) {
        // Fallback to database query if cache parse fails
      }
    }

    const trip = await this.repo.findTripTrackingById(tripId);
    if (!trip) {
      throw new NotFoundException(`Real-time tracking for trip ID '${tripId}' not found`);
    }

    // Cache latest trip status for 10 seconds
    await this.redis.set(cacheKey, JSON.stringify(trip), 10);
    return trip;
  }

  async getNearbyVehicles(params: NearbyVehiclesDto): Promise<ActiveVehicleLocationEntity[]> {
    return this.repo.findNearbyVehicles(params);
  }
}
