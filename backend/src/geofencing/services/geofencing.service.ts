import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CreateGeofenceDto } from '../dto/create-geofence.dto';
import { EvaluateGeofenceDto } from '../dto/evaluate-geofence.dto';
import { QueryGeofenceEventsDto } from '../dto/query-geofence-events.dto';
import { QueryGeofencesDto } from '../dto/query-geofences.dto';
import { RecordGeofenceEventDto } from '../dto/record-geofence-event.dto';
import { UpdateGeofenceDto } from '../dto/update-geofence.dto';
import {
  GeofenceEntity,
  GeofenceEventEntity,
  GeofencingRepository,
} from '../repositories/geofencing.repository';

@Injectable()
export class GeofencingService {
  private readonly logger = new Logger(GeofencingService.name);

  constructor(private readonly repo: GeofencingRepository) {}

  private calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const R = 6371000; // Earth radius in meters
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  async createGeofence(dto: CreateGeofenceDto): Promise<GeofenceEntity> {
    const existing = await this.repo.findByName(dto.name);
    if (existing) {
      throw new ConflictException(`Geofence with name '${dto.name}' already exists`);
    }

    this.logger.log(`Creating geofence perimeter '${dto.name}' (${dto.radiusMeters}m)`);
    return this.repo.createGeofence(dto);
  }

  async getGeofences(params: QueryGeofencesDto) {
    return this.repo.findAll(params);
  }

  async getGeofenceById(id: string): Promise<GeofenceEntity> {
    const geofence = await this.repo.findById(id);
    if (!geofence) {
      throw new NotFoundException(`Geofence with ID '${id}' not found`);
    }
    return geofence;
  }

  async updateGeofence(id: string, dto: UpdateGeofenceDto): Promise<GeofenceEntity> {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFoundException(`Geofence with ID '${id}' not found`);
    }

    if (dto.name && dto.name !== existing.name) {
      const nameConflict = await this.repo.findByName(dto.name);
      if (nameConflict) {
        throw new ConflictException(`Geofence with name '${dto.name}' already exists`);
      }
    }

    this.logger.log(`Updating geofence '${id}'`);
    const updated = await this.repo.updateGeofence(id, dto);
    if (!updated) {
      throw new NotFoundException(`Geofence with ID '${id}' not found`);
    }
    return updated;
  }

  async deleteGeofence(id: string): Promise<GeofenceEntity> {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFoundException(`Geofence with ID '${id}' not found`);
    }

    this.logger.log(`Deactivating geofence '${id}'`);
    const deactivated = await this.repo.deactivateGeofence(id);
    if (!deactivated) {
      throw new NotFoundException(`Geofence with ID '${id}' not found`);
    }
    return deactivated;
  }

  async evaluateVehiclePosition(dto: EvaluateGeofenceDto) {
    const activeGeofences = await this.repo.findActiveGeofences();
    const insideGeofenceIds: string[] = [];
    const transitionEvents: GeofenceEventEntity[] = [];

    for (const fence of activeGeofences) {
      const distance = this.calculateDistanceMeters(
        dto.latitude,
        dto.longitude,
        fence.latitude,
        fence.longitude,
      );

      const isInside = distance <= fence.radius_meters;
      if (isInside) {
        insideGeofenceIds.push(fence.id);
      }

      // Check previous transition state
      const lastEvent = await this.repo.findLatestEventForVehicleAndGeofence(
        dto.vehicleId,
        fence.id,
      );

      if (isInside && (!lastEvent || lastEvent.event_type === 'EXIT')) {
        const enterEvent = await this.repo.insertGeofenceEvent({
          geofenceId: fence.id,
          vehicleId: dto.vehicleId,
          tripId: dto.tripId,
          eventType: 'ENTER',
          latitude: dto.latitude,
          longitude: dto.longitude,
          occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
        });
        transitionEvents.push(enterEvent);
        this.logger.log(`Vehicle ${dto.vehicleId} ENTERED geofence '${fence.name}'`);
      } else if (!isInside && lastEvent && lastEvent.event_type === 'ENTER') {
        const exitEvent = await this.repo.insertGeofenceEvent({
          geofenceId: fence.id,
          vehicleId: dto.vehicleId,
          tripId: dto.tripId,
          eventType: 'EXIT',
          latitude: dto.latitude,
          longitude: dto.longitude,
          occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
        });
        transitionEvents.push(exitEvent);
        this.logger.log(`Vehicle ${dto.vehicleId} EXITED geofence '${fence.name}'`);
      }
    }

    return {
      vehicleId: dto.vehicleId,
      evaluatedCount: activeGeofences.length,
      insideGeofenceIds,
      transitionEvents,
    };
  }

  async recordGeofenceEvent(dto: RecordGeofenceEventDto): Promise<GeofenceEventEntity> {
    const geofence = await this.repo.findById(dto.geofenceId);
    if (!geofence) {
      throw new NotFoundException(`Geofence with ID '${dto.geofenceId}' not found`);
    }

    return this.repo.insertGeofenceEvent({
      geofenceId: dto.geofenceId,
      vehicleId: dto.vehicleId,
      tripId: dto.tripId,
      eventType: dto.eventType,
      latitude: dto.latitude,
      longitude: dto.longitude,
      occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
    });
  }

  async getGeofenceEvents(params: QueryGeofenceEventsDto) {
    return this.repo.findGeofenceEvents(params);
  }
}
