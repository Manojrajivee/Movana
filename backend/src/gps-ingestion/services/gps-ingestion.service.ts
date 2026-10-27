import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { RedisService } from '../../redis/redis.service';
import { BatchIngestGpsDto } from '../dto/batch-ingest-gps.dto';
import { IngestGpsPointDto } from '../dto/ingest-gps-point.dto';
import { QueryLocationHistoryDto } from '../dto/query-location-history.dto';
import { RecordTrackingEventDto } from '../dto/record-tracking-event.dto';
import {
  GpsIngestionRepository,
  LocationHistoryEntity,
  TrackingEventEntity,
} from '../repositories/gps-ingestion.repository';

@Injectable()
export class GpsIngestionService {
  private readonly logger = new Logger(GpsIngestionService.name);

  constructor(
    private readonly repo: GpsIngestionRepository,
    private readonly db: DatabaseService,
    private readonly redis: RedisService,
  ) {}

  async ingestGpsPoint(dto: IngestGpsPointDto) {
    const device = await this.repo.findDeviceByImei(dto.deviceImei);
    if (!device) {
      throw new NotFoundException(`Tracking device with IMEI '${dto.deviceImei}' not found`);
    }

    const vehicleId = dto.vehicleId ?? device.vehicle_id;
    if (!vehicleId) {
      throw new BadRequestException(
        `Device '${dto.deviceImei}' is not assigned to a vehicle and vehicleId was not specified`,
      );
    }

    const point = await this.db.withTransaction(async (client) => {
      const inserted = await this.repo.insertLocationPoint(
        {
          vehicleId,
          tripId: dto.tripId,
          driverId: dto.driverId,
          latitude: dto.latitude,
          longitude: dto.longitude,
          accuracyMeters: dto.accuracyMeters,
          speedKmh: dto.speedKmh ?? 0,
          headingDegrees: dto.headingDegrees,
          altitudeMeters: dto.altitudeMeters,
          odometer: dto.odometer,
          recordedAt: dto.recordedAt,
          source: dto.source ?? 'GPS_DEVICE',
        },
        client,
      );

      await this.repo.updateVehicleTelemetry(
        vehicleId,
        dto.latitude,
        dto.longitude,
        dto.recordedAt,
        dto.odometer,
        client,
      );

      if (dto.tripId) {
        await this.repo.updateTripTelemetry(dto.tripId, dto.latitude, dto.longitude, client);
      }

      return inserted;
    });

    // Update Redis live location cache
    const liveCacheData = {
      vehicle_id: vehicleId,
      latitude: dto.latitude,
      longitude: dto.longitude,
      speed_kmh: dto.speedKmh,
      heading_degrees: dto.headingDegrees,
      last_location_at: dto.recordedAt,
      trip_id: dto.tripId ?? null,
    };
    await this.redis.set(`tracking:vehicle:${vehicleId}`, JSON.stringify(liveCacheData), 60);

    return {
      success: true,
      id: point.id,
      vehicleId,
      recordedAt: point.recorded_at,
    };
  }

  async batchIngestGps(dto: BatchIngestGpsDto) {
    this.logger.log(`Ingesting batch of ${dto.points.length} GPS telemetry fixes`);

    const processed = await this.db.withTransaction(async (client) => {
      let count = 0;
      for (const p of dto.points) {
        const device = await this.repo.findDeviceByImei(p.deviceImei);
        if (!device) {
          continue; // Skip unrecognized device points in batch
        }
        const vehicleId = p.vehicleId ?? device.vehicle_id;
        if (!vehicleId) {
          continue;
        }

        await this.repo.insertLocationPoint(
          {
            vehicleId,
            tripId: p.tripId,
            driverId: p.driverId,
            latitude: p.latitude,
            longitude: p.longitude,
            accuracyMeters: p.accuracyMeters,
            speedKmh: p.speedKmh ?? 0,
            headingDegrees: p.headingDegrees,
            altitudeMeters: p.altitudeMeters,
            odometer: p.odometer,
            recordedAt: p.recordedAt,
            source: p.source ?? 'GPS_DEVICE',
          },
          client,
        );

        await this.repo.updateVehicleTelemetry(
          vehicleId,
          p.latitude,
          p.longitude,
          p.recordedAt,
          p.odometer,
          client,
        );

        if (p.tripId) {
          await this.repo.updateTripTelemetry(p.tripId, p.latitude, p.longitude, client);
        }

        count++;
      }
      return count;
    });

    return {
      success: true,
      processedCount: processed,
    };
  }

  async recordTrackingEvent(dto: RecordTrackingEventDto): Promise<TrackingEventEntity> {
    const device = await this.repo.findDeviceByImei(dto.deviceImei);
    if (!device) {
      throw new NotFoundException(`Tracking device with IMEI '${dto.deviceImei}' not found`);
    }

    const vehicleId = dto.vehicleId ?? device.vehicle_id;
    if (!vehicleId) {
      throw new BadRequestException(
        `Device '${dto.deviceImei}' is not assigned to a vehicle and vehicleId was not specified`,
      );
    }

    this.logger.log(
      `Recording tracking event '${dto.eventType}' for device ${dto.deviceImei} (vehicle ${vehicleId})`,
    );

    return this.repo.insertTrackingEvent({
      deviceId: device.id,
      vehicleId,
      eventType: dto.eventType,
      payload: dto.payload ?? {},
      recordedAt: dto.recordedAt,
    });
  }

  async getLocationHistory(
    vehicleId: string,
    query: QueryLocationHistoryDto,
  ): Promise<{ items: LocationHistoryEntity[]; total: number }> {
    return this.repo.findLocationHistory(vehicleId, query);
  }
}
