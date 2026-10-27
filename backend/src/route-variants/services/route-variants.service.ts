import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { AddRouteStopDto } from '../dto/add-route-stop.dto';
import { ReorderRouteStopsDto } from '../dto/reorder-route-stops.dto';
import { UpdateRouteStopDto } from '../dto/update-route-stop.dto';
import {
  RouteStopEntity,
  RouteVariantsRepository,
} from '../repositories/route-variants.repository';

@Injectable()
export class RouteVariantsService {
  private readonly logger = new Logger(RouteVariantsService.name);

  constructor(
    private readonly repo: RouteVariantsRepository,
    private readonly db: DatabaseService,
  ) {}

  private async assertRouteExists(routeId: string): Promise<void> {
    const exists = await this.repo.checkRouteExists(routeId);
    if (!exists) {
      throw new NotFoundException(`Route with ID '${routeId}' not found`);
    }
  }

  async addRouteStop(routeId: string, dto: AddRouteStopDto): Promise<RouteStopEntity> {
    await this.assertRouteExists(routeId);

    const stopExists = await this.repo.checkStopExists(dto.stopId);
    if (!stopExists) {
      throw new NotFoundException(`Stop with ID '${dto.stopId}' not found`);
    }

    const existingStop = await this.repo.findRouteStop(routeId, dto.stopId);
    if (existingStop) {
      throw new ConflictException(
        `Stop '${dto.stopId}' is already registered in the topological alignment of route '${routeId}'`,
      );
    }

    const occupiedSeq = await this.repo.findBySequence(routeId, dto.sequenceNumber);
    if (occupiedSeq) {
      throw new ConflictException(
        `Sequence position #${dto.sequenceNumber} is already occupied on route '${routeId}'`,
      );
    }

    this.logger.log(
      `Adding stop ${dto.stopId} at sequence #${dto.sequenceNumber} to route ${routeId}`,
    );

    return this.repo.addRouteStop({
      routeId,
      stopId: dto.stopId,
      sequenceNumber: dto.sequenceNumber,
      arrivalOffsetMinutes: dto.arrivalOffsetMinutes,
      departureOffsetMinutes: dto.departureOffsetMinutes,
      distanceFromOriginKm: dto.distanceFromOriginKm,
      isBoardingAllowed: dto.isBoardingAllowed,
      isDropoffAllowed: dto.isDropoffAllowed,
    });
  }

  async getStopsByRouteId(routeId: string): Promise<RouteStopEntity[]> {
    await this.assertRouteExists(routeId);
    return this.repo.findStopsByRouteId(routeId);
  }

  async getRouteStop(routeId: string, stopId: string): Promise<RouteStopEntity> {
    await this.assertRouteExists(routeId);
    const stop = await this.repo.findRouteStop(routeId, stopId);
    if (!stop) {
      throw new NotFoundException(
        `Stop '${stopId}' is not part of route '${routeId}' topological alignment`,
      );
    }
    return stop;
  }

  async updateRouteStop(
    routeId: string,
    stopId: string,
    dto: UpdateRouteStopDto,
  ): Promise<RouteStopEntity> {
    const existing = await this.getRouteStop(routeId, stopId);

    const effectiveArrival =
      dto.arrivalOffsetMinutes !== undefined
        ? dto.arrivalOffsetMinutes
        : existing.arrival_offset_minutes;
    const effectiveDeparture =
      dto.departureOffsetMinutes !== undefined
        ? dto.departureOffsetMinutes
        : existing.departure_offset_minutes;

    if (effectiveDeparture < effectiveArrival) {
      throw new BadRequestException(
        'departureOffsetMinutes must be greater than or equal to arrivalOffsetMinutes',
      );
    }

    this.logger.log(`Updating alignment offsets for stop ${stopId} on route ${routeId}`);
    const updated = await this.repo.updateRouteStop(routeId, stopId, dto);
    if (!updated) {
      throw new NotFoundException(`Stop '${stopId}' not found on route '${routeId}'`);
    }
    return updated;
  }

  async deleteRouteStop(routeId: string, stopId: string): Promise<RouteStopEntity> {
    await this.getRouteStop(routeId, stopId);
    this.logger.log(`Removing stop ${stopId} from route ${routeId} alignment`);
    const deleted = await this.repo.deleteRouteStop(routeId, stopId);
    if (!deleted) {
      throw new NotFoundException(`Stop '${stopId}' not found on route '${routeId}'`);
    }
    return deleted;
  }

  async reorderRouteStops(routeId: string, dto: ReorderRouteStopsDto): Promise<RouteStopEntity[]> {
    await this.assertRouteExists(routeId);

    const existingStops = await this.repo.findStopsByRouteId(routeId);
    if (existingStops.length !== dto.stops.length) {
      throw new BadRequestException(
        `Reorder payload contains ${dto.stops.length} stops, but route currently has ${existingStops.length} stops. All existing stops must be accounted for.`,
      );
    }

    const existingIds = new Set(existingStops.map((s) => s.stop_id));
    for (const item of dto.stops) {
      if (!existingIds.has(item.stopId)) {
        throw new BadRequestException(
          `Stop '${item.stopId}' does not belong to route '${routeId}' alignment`,
        );
      }
    }

    this.logger.log(`Reordering ${dto.stops.length} stops on route ${routeId}`);

    return this.db.withTransaction(async (client) => {
      // Step 1: Temporarily set sequence numbers to negative values to avoid UNIQUE collision
      for (let i = 0; i < dto.stops.length; i++) {
        const item = dto.stops[i];
        await this.repo.updateStopSequence(routeId, item.stopId, -(i + 1000), client);
      }

      // Step 2: Assign desired positive sequence numbers
      for (const item of dto.stops) {
        await this.repo.updateStopSequence(routeId, item.stopId, item.sequenceNumber, client);
      }

      return this.repo.findStopsByRouteId(routeId, client);
    });
  }

  async getAlignmentSummary(routeId: string) {
    await this.assertRouteExists(routeId);
    const stops = await this.repo.findStopsByRouteId(routeId);

    let maxDistance = 0;
    let maxOffset = 0;
    let boardingCount = 0;
    let dropoffCount = 0;

    for (const s of stops) {
      if (Number(s.distance_from_origin_km) > maxDistance) {
        maxDistance = Number(s.distance_from_origin_km);
      }
      if (s.departure_offset_minutes > maxOffset) {
        maxOffset = s.departure_offset_minutes;
      }
      if (s.is_boarding_allowed) boardingCount++;
      if (s.is_dropoff_allowed) dropoffCount++;
    }

    return {
      routeId,
      totalStops: stops.length,
      maxDistanceFromOriginKm: maxDistance,
      totalDurationOffsetMinutes: maxOffset,
      boardingStopsCount: boardingCount,
      dropoffStopsCount: dropoffCount,
      stops: stops.map((s) => ({
        sequenceNumber: s.sequence_number,
        stopId: s.stop_id,
        stopCode: s.stop_code,
        stopName: s.stop_name,
        city: s.stop_city,
        arrivalOffsetMinutes: s.arrival_offset_minutes,
        departureOffsetMinutes: s.departure_offset_minutes,
        distanceFromOriginKm: Number(s.distance_from_origin_km),
        isBoardingAllowed: s.is_boarding_allowed,
        isDropoffAllowed: s.is_dropoff_allowed,
      })),
    };
  }
}
