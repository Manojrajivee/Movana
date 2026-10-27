import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DelaysRepository, NetworkDelaySummary } from '../repositories/delays.repository';
import { DetectTripDelayDto } from '../dto/detect-trip-delay.dto';
import { QueryActiveDelaysDto } from '../dto/query-active-delays.dto';
import { ResolveTripDelayDto } from '../dto/resolve-trip-delay.dto';

export interface TripDelayDetectionResult {
  tripId: string;
  tripNumber: string;
  routeCode: string;
  vehicleCode: string | null;
  status: string;
  delayMinutes: number;
  isDelayed: boolean;
  thresholdMinutes: number;
  statusChanged: boolean;
  message: string;
}

@Injectable()
export class DelaysService {
  private readonly logger = new Logger(DelaysService.name);

  constructor(private readonly repo: DelaysRepository) {}

  async detectTripDelay(
    tripId: string,
    dto: DetectTripDelayDto,
    userId?: string,
  ): Promise<TripDelayDetectionResult> {
    const trip = await this.repo.findTripForDelay(tripId);
    if (!trip) {
      throw new NotFoundException(`Trip with ID '${tripId}' not found`);
    }

    const threshold = dto.thresholdMinutes ?? 5;
    let calculatedDelay =
      dto.simulatedDelayMinutes !== undefined ? dto.simulatedDelayMinutes : trip.delay_minutes;

    if (dto.simulatedDelayMinutes === undefined) {
      const now = Date.now();
      const schedDep = new Date(trip.scheduled_departure_at).getTime();
      if (['SCHEDULED', 'BOARDING'].includes(trip.status) && now > schedDep) {
        calculatedDelay = Math.max(calculatedDelay, Math.floor((now - schedDep) / 60000));
      }
    }

    const isDelayed = calculatedDelay >= threshold;
    let statusChanged = false;
    let newStatus = trip.status;
    let message = 'Trip is operating within on-time schedule parameters';

    if (isDelayed) {
      if (
        trip.status !== 'DELAYED' &&
        !['COMPLETED', 'CANCELLED', 'ARRIVED'].includes(trip.status)
      ) {
        newStatus = 'DELAYED';
        statusChanged = true;
        message = `Delay detected: trip is ${calculatedDelay} minutes behind schedule (threshold: ${threshold}m)`;

        await this.repo.updateTripDelay(tripId, calculatedDelay, newStatus);

        await this.repo.recordTripEvent(
          tripId,
          trip.vehicle_id,
          trip.primary_driver_id,
          'DELAY_DETECTED',
          {
            previousDelay: trip.delay_minutes,
            newDelay: calculatedDelay,
            thresholdMinutes: threshold,
            reason: dto.reason ?? 'Automated delay detection threshold exceeded',
          },
        );

        await this.repo.recordTripStatusHistory(
          tripId,
          trip.status,
          newStatus,
          dto.reason ?? 'Delay threshold exceeded',
          userId ?? null,
        );
      } else {
        if (trip.delay_minutes !== calculatedDelay) {
          await this.repo.updateTripDelay(tripId, calculatedDelay);
          await this.repo.recordTripEvent(
            tripId,
            trip.vehicle_id,
            trip.primary_driver_id,
            'DELAY_UPDATED',
            {
              previousDelay: trip.delay_minutes,
              newDelay: calculatedDelay,
              thresholdMinutes: threshold,
            },
          );
        }
        message = `Trip remains in DELAYED status: current delay is ${calculatedDelay} minutes`;
      }
    } else if (!isDelayed && trip.status === 'DELAYED') {
      newStatus = trip.actual_departure_at ? 'IN_TRANSIT' : 'SCHEDULED';
      statusChanged = true;
      message = `Trip delay resolved: vehicle schedule recovered to ${calculatedDelay} minutes`;

      await this.repo.updateTripDelay(tripId, calculatedDelay, newStatus);

      await this.repo.recordTripEvent(
        tripId,
        trip.vehicle_id,
        trip.primary_driver_id,
        'DELAY_RESOLVED',
        {
          previousDelay: trip.delay_minutes,
          newDelay: calculatedDelay,
          thresholdMinutes: threshold,
          reason: 'Trip delay recovered within tolerance threshold',
        },
      );

      await this.repo.recordTripStatusHistory(
        tripId,
        'DELAYED',
        newStatus,
        'Trip recovered schedule',
        userId ?? null,
      );
    } else {
      if (trip.delay_minutes !== calculatedDelay) {
        await this.repo.updateTripDelay(tripId, calculatedDelay);
      }
    }

    return {
      tripId: trip.trip_id,
      tripNumber: trip.trip_number,
      routeCode: trip.route_code,
      vehicleCode: trip.vehicle_code,
      status: newStatus,
      delayMinutes: calculatedDelay,
      isDelayed,
      thresholdMinutes: threshold,
      statusChanged,
      message,
    };
  }

  async getActiveDelays(dto: QueryActiveDelaysDto) {
    const minDelayMinutes = dto.minDelayMinutes ?? 1;
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const offset = (page - 1) * limit;

    const { items, total } = await this.repo.findActiveDelayedTrips({
      minDelayMinutes,
      routeId: dto.routeId,
      vehicleId: dto.vehicleId,
      limit,
      offset,
    });

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  async getDelaySummary(): Promise<NetworkDelaySummary> {
    return this.repo.getDelaySummary();
  }

  async resolveTripDelay(tripId: string, dto: ResolveTripDelayDto, userId?: string) {
    const trip = await this.repo.findTripForDelay(tripId);
    if (!trip) {
      throw new NotFoundException(`Trip with ID '${tripId}' not found`);
    }

    const resolvedDelay = dto.delayMinutes ?? 0;
    const newStatus = dto.newStatus ?? (trip.actual_departure_at ? 'IN_TRANSIT' : 'SCHEDULED');

    await this.repo.updateTripDelay(tripId, resolvedDelay, newStatus);

    await this.repo.recordTripEvent(
      tripId,
      trip.vehicle_id,
      trip.primary_driver_id,
      'DELAY_MANUALLY_RESOLVED',
      {
        previousDelay: trip.delay_minutes,
        newDelay: resolvedDelay,
        resolutionNotes: dto.resolutionNotes,
        resolvedBy: userId ?? null,
      },
    );

    if (trip.status !== newStatus) {
      await this.repo.recordTripStatusHistory(
        tripId,
        trip.status,
        newStatus,
        dto.resolutionNotes,
        userId ?? null,
      );
    }

    return {
      tripId,
      tripNumber: trip.trip_number,
      previousStatus: trip.status,
      newStatus,
      previousDelayMinutes: trip.delay_minutes,
      resolvedDelayMinutes: resolvedDelay,
      resolutionNotes: dto.resolutionNotes,
      resolvedAt: new Date(),
    };
  }
}
