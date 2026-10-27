import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { QueryMilestonesDto } from '../dto/query-trip-progress.dto';
import { RecordMilestoneDto } from '../dto/record-milestone.dto';
import {
  LiveBoardItemEntity,
  TripMilestoneEntity,
  TripProgressRepository,
  TripProgressStopEntity,
} from '../repositories/trip-progress.repository';

export interface TripProgressResponse {
  tripId: string;
  tripNumber: string;
  routeCode: string;
  routeName: string;
  status: string;
  vehicleCode: string | null;
  registrationNumber: string | null;
  driverName: string | null;
  progressPercentage: number;
  stopsSummary: {
    total: number;
    completed: number;
    remaining: number;
    currentStop: { id: string; name: string } | null;
    nextStop: { id: string; name: string; sequenceNumber: number; scheduledArrivalAt: Date } | null;
    lastCompletedStop: { id: string; name: string; sequenceNumber: number } | null;
  };
  distanceSummary: {
    totalDistanceKm: number;
    distanceCoveredKm: number;
    remainingDistanceKm: number;
  };
  scheduleSummary: {
    scheduledDepartureAt: Date;
    scheduledArrivalAt: Date;
    actualDepartureAt: Date | null;
    actualArrivalAt: Date | null;
    delayMinutes: number;
  };
  currentPosition: {
    latitude: number | null;
    longitude: number | null;
    lastReportedAt: Date;
  };
  milestonesCount: number;
  stops: TripProgressStopEntity[];
}

@Injectable()
export class TripProgressService {
  private readonly logger = new Logger(TripProgressService.name);

  constructor(private readonly repo: TripProgressRepository) {}

  async getTripProgress(tripId: string): Promise<TripProgressResponse> {
    const trip = await this.repo.findTripProgressDetail(tripId);
    if (!trip) {
      throw new NotFoundException(`Trip with ID '${tripId}' not found`);
    }

    const stops = await this.repo.findTripStops(tripId);
    const milestonesCount = await this.repo.countTripMilestones(tripId);

    const completedStops = stops.filter((s) => ['ARRIVED', 'DEPARTED'].includes(s.status));
    const pendingStops = stops.filter((s) => s.status === 'PENDING');

    const lastCompletedStop =
      completedStops.length > 0 ? completedStops[completedStops.length - 1] : null;
    const nextStop = pendingStops.length > 0 ? pendingStops[0] : null;

    const totalStopsCount = stops.length;
    const completedStopsCount = completedStops.length;
    const remainingStopsCount = totalStopsCount - completedStopsCount;

    let progressPercentage = 0.0;
    if (trip.status === 'COMPLETED' || trip.status === 'ARRIVED') {
      progressPercentage = 100.0;
    } else if (trip.status === 'CANCELLED') {
      progressPercentage = 0.0;
    } else if (totalStopsCount > 0) {
      progressPercentage = Math.round((completedStopsCount / totalStopsCount) * 1000) / 10;
    }

    const totalDistance = Number(trip.distance_km) || 0.0;
    const distanceCovered =
      totalStopsCount > 0
        ? Math.round((completedStopsCount / totalStopsCount) * totalDistance * 100) / 100
        : 0.0;
    const remainingDistance = Math.max(
      0,
      Math.round((totalDistance - distanceCovered) * 100) / 100,
    );

    return {
      tripId: trip.id,
      tripNumber: trip.trip_number,
      routeCode: trip.route_code,
      routeName: trip.route_name,
      status: trip.status,
      vehicleCode: trip.vehicle_code || null,
      registrationNumber: trip.registration_number || null,
      driverName: trip.driver_name || null,
      progressPercentage,
      stopsSummary: {
        total: totalStopsCount,
        completed: completedStopsCount,
        remaining: remainingStopsCount,
        currentStop: trip.current_stop_id
          ? { id: trip.current_stop_id, name: trip.current_stop_name || 'Unknown' }
          : null,
        nextStop: nextStop
          ? {
              id: nextStop.stop_id,
              name: nextStop.stop_name,
              sequenceNumber: nextStop.sequence_number,
              scheduledArrivalAt: nextStop.scheduled_arrival_at,
            }
          : null,
        lastCompletedStop: lastCompletedStop
          ? {
              id: lastCompletedStop.stop_id,
              name: lastCompletedStop.stop_name,
              sequenceNumber: lastCompletedStop.sequence_number,
            }
          : null,
      },
      distanceSummary: {
        totalDistanceKm: totalDistance,
        distanceCoveredKm: distanceCovered,
        remainingDistanceKm: remainingDistance,
      },
      scheduleSummary: {
        scheduledDepartureAt: trip.scheduled_departure_at,
        scheduledArrivalAt: trip.scheduled_arrival_at,
        actualDepartureAt: trip.actual_departure_at,
        actualArrivalAt: trip.actual_arrival_at,
        delayMinutes: trip.delay_minutes,
      },
      currentPosition: {
        latitude: trip.current_latitude ? Number(trip.current_latitude) : null,
        longitude: trip.current_longitude ? Number(trip.current_longitude) : null,
        lastReportedAt: trip.updated_at,
      },
      milestonesCount,
      stops,
    };
  }

  async recordMilestone(
    tripId: string,
    dto: RecordMilestoneDto,
    userId?: string,
  ): Promise<TripMilestoneEntity> {
    const trip = await this.repo.findTripProgressDetail(tripId);
    if (!trip) {
      throw new NotFoundException(`Trip with ID '${tripId}' not found`);
    }

    if (trip.status === 'CANCELLED') {
      throw new BadRequestException('Cannot record milestone event for a cancelled trip');
    }

    const eventPayload: Record<string, any> = {
      ...(dto.eventData || {}),
      stopId: dto.stopId || null,
      latitude: dto.latitude ?? null,
      longitude: dto.longitude ?? null,
      recordedBy: userId || null,
    };

    return this.repo.recordMilestoneEvent(
      tripId,
      trip.vehicle_id,
      trip.primary_driver_id,
      dto.eventType,
      eventPayload,
      dto.occurredAt ? new Date(dto.occurredAt) : undefined,
    );
  }

  async getTripMilestones(
    tripId: string,
    query: QueryMilestonesDto,
  ): Promise<TripMilestoneEntity[]> {
    const trip = await this.repo.findTripProgressDetail(tripId);
    if (!trip) {
      throw new NotFoundException(`Trip with ID '${tripId}' not found`);
    }

    return this.repo.findTripMilestones(tripId, query.limit, query.eventType);
  }

  async getLiveBoard(): Promise<Array<LiveBoardItemEntity & { progressPercentage: number }>> {
    const items = await this.repo.getActiveLiveBoard();
    return items.map((item) => {
      const total = item.total_stops || 0;
      const completed = item.completed_stops || 0;
      const progressPercentage = total > 0 ? Math.round((completed / total) * 1000) / 10 : 0.0;
      return {
        ...item,
        progressPercentage,
      };
    });
  }
}
