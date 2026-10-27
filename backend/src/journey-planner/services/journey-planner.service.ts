import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PlanJourneyDto } from '../dto/plan-journey.dto';
import { QueryDirectJourneyDto } from '../dto/query-direct-journey.dto';
import {
  DirectRouteConnection,
  JourneyPlannerRepository,
  StopCoordinateEntity,
  TransferRouteConnection,
} from '../repositories/journey-planner.repository';

export interface JourneyLeg {
  legIndex: number;
  mode: string;
  routeId: string;
  routeCode: string;
  routeName: string;
  fromStop: StopCoordinateEntity;
  toStop: StopCoordinateEntity;
  stopsCount: number;
  durationMinutes: number;
  distanceKm: number;
  upcomingTrips?: any[];
}

export interface JourneyItinerary {
  id: string;
  transfers: number;
  totalDurationMinutes: number;
  totalDistanceKm: number;
  origin: StopCoordinateEntity;
  destination: StopCoordinateEntity;
  walkingTransferMinutes: number;
  legs: JourneyLeg[];
}

@Injectable()
export class JourneyPlannerService {
  private readonly logger = new Logger(JourneyPlannerService.name);
  private readonly DEFAULT_TRANSFER_BUFFER_MINUTES = 15;

  constructor(private readonly repo: JourneyPlannerRepository) {}

  async planJourney(dto: PlanJourneyDto): Promise<{
    origin: StopCoordinateEntity;
    destination: StopCoordinateEntity;
    itinerariesCount: number;
    itineraries: JourneyItinerary[];
  }> {
    // 1. Resolve Origin Stop
    let origin: StopCoordinateEntity | null = null;
    if (dto.originStopId) {
      origin = await this.repo.findStopById(dto.originStopId);
      if (!origin) {
        throw new NotFoundException(`Origin stop with ID '${dto.originStopId}' not found`);
      }
    } else if (dto.originLatitude !== undefined && dto.originLongitude !== undefined) {
      origin = await this.repo.findNearestStop(dto.originLatitude, dto.originLongitude);
      if (!origin) {
        throw new NotFoundException('No active transit stops found near origin coordinates');
      }
    }

    // 2. Resolve Destination Stop
    let destination: StopCoordinateEntity | null = null;
    if (dto.destinationStopId) {
      destination = await this.repo.findStopById(dto.destinationStopId);
      if (!destination) {
        throw new NotFoundException(
          `Destination stop with ID '${dto.destinationStopId}' not found`,
        );
      }
    } else if (dto.destinationLatitude !== undefined && dto.destinationLongitude !== undefined) {
      destination = await this.repo.findNearestStop(
        dto.destinationLatitude,
        dto.destinationLongitude,
      );
      if (!destination) {
        throw new NotFoundException('No active transit stops found near destination coordinates');
      }
    }

    if (!origin || !destination) {
      throw new BadRequestException('Unable to resolve origin or destination stop');
    }

    if (origin.id === destination.id) {
      throw new BadRequestException('Origin stop and destination stop cannot be the same');
    }

    const itineraries: JourneyItinerary[] = [];

    // 3. Find Direct Routes
    const directRoutes = await this.repo.findDirectRoutes(origin.id, destination.id);
    for (const [idx, dr] of directRoutes.entries()) {
      const trips = await this.repo.findUpcomingTripsForRoute(dr.route_id, 3);
      itineraries.push({
        id: `itinerary-direct-${idx + 1}-${dr.route_code}`,
        transfers: 0,
        totalDurationMinutes: dr.estimated_duration_minutes,
        totalDistanceKm: dr.distance_km,
        origin,
        destination,
        walkingTransferMinutes: 0,
        legs: [
          {
            legIndex: 1,
            mode: 'BUS',
            routeId: dr.route_id,
            routeCode: dr.route_code,
            routeName: dr.route_name,
            fromStop: origin,
            toStop: destination,
            stopsCount: dr.intermediate_stops_count,
            durationMinutes: dr.estimated_duration_minutes,
            distanceKm: dr.distance_km,
            upcomingTrips: trips,
          },
        ],
      });
    }

    // 4. Find Transfer Routes if maxTransfers >= 1
    if (dto.maxTransfers >= 1) {
      const transferRoutes = await this.repo.findTransferRoutes(origin.id, destination.id, 10);
      for (const [idx, tr] of transferRoutes.entries()) {
        const transferStop: StopCoordinateEntity = {
          id: tr.transfer_stop_id,
          stop_code: tr.transfer_stop_code,
          name: tr.transfer_stop_name,
          city: origin.city,
          latitude: tr.transfer_latitude,
          longitude: tr.transfer_longitude,
        };

        const leg1StopsCount = tr.leg1_dest_seq - tr.leg1_origin_seq;
        const leg2StopsCount = tr.leg2_dest_seq - tr.leg2_origin_seq;

        // Estimated leg durations (approx 3 mins per stop)
        const leg1Duration = Math.max(5, leg1StopsCount * 3);
        const leg2Duration = Math.max(5, leg2StopsCount * 3);
        const totalDuration = leg1Duration + leg2Duration + this.DEFAULT_TRANSFER_BUFFER_MINUTES;

        itineraries.push({
          id: `itinerary-transfer-${idx + 1}-${tr.leg1_route_code}-${tr.leg2_route_code}`,
          transfers: 1,
          totalDurationMinutes: totalDuration,
          totalDistanceKm: parseFloat(((leg1StopsCount + leg2StopsCount) * 1.5).toFixed(2)),
          origin,
          destination,
          walkingTransferMinutes: this.DEFAULT_TRANSFER_BUFFER_MINUTES,
          legs: [
            {
              legIndex: 1,
              mode: 'BUS',
              routeId: tr.leg1_route_id,
              routeCode: tr.leg1_route_code,
              routeName: tr.leg1_route_name,
              fromStop: origin,
              toStop: transferStop,
              stopsCount: leg1StopsCount,
              durationMinutes: leg1Duration,
              distanceKm: parseFloat((leg1StopsCount * 1.5).toFixed(2)),
            },
            {
              legIndex: 2,
              mode: 'BUS',
              routeId: tr.leg2_route_id,
              routeCode: tr.leg2_route_code,
              routeName: tr.leg2_route_name,
              fromStop: transferStop,
              toStop: destination,
              stopsCount: leg2StopsCount,
              durationMinutes: leg2Duration,
              distanceKm: parseFloat((leg2StopsCount * 1.5).toFixed(2)),
            },
          ],
        });
      }
    }

    // 5. Sort Itineraries
    if (dto.sortBy === 'TRANSFERS') {
      itineraries.sort(
        (a, b) => a.transfers - b.transfers || a.totalDurationMinutes - b.totalDurationMinutes,
      );
    } else {
      itineraries.sort((a, b) => a.totalDurationMinutes - b.totalDurationMinutes);
    }

    return {
      origin,
      destination,
      itinerariesCount: itineraries.length,
      itineraries,
    };
  }

  async getDirectRoutes(dto: QueryDirectJourneyDto): Promise<{
    origin: StopCoordinateEntity;
    destination: StopCoordinateEntity;
    directRoutes: DirectRouteConnection[];
  }> {
    const origin = await this.repo.findStopById(dto.originStopId);
    if (!origin) {
      throw new NotFoundException(`Origin stop with ID '${dto.originStopId}' not found`);
    }

    const destination = await this.repo.findStopById(dto.destinationStopId);
    if (!destination) {
      throw new NotFoundException(`Destination stop with ID '${dto.destinationStopId}' not found`);
    }

    if (origin.id === destination.id) {
      throw new BadRequestException('Origin stop and destination stop cannot be the same');
    }

    const directRoutes = await this.repo.findDirectRoutes(origin.id, destination.id);
    return {
      origin,
      destination,
      directRoutes: directRoutes.slice(0, dto.limit),
    };
  }

  async getTransferRoutes(
    originStopId: string,
    destinationStopId: string,
    limit = 10,
  ): Promise<{
    origin: StopCoordinateEntity;
    destination: StopCoordinateEntity;
    transferRoutes: TransferRouteConnection[];
  }> {
    const origin = await this.repo.findStopById(originStopId);
    if (!origin) {
      throw new NotFoundException(`Origin stop with ID '${originStopId}' not found`);
    }

    const destination = await this.repo.findStopById(destinationStopId);
    if (!destination) {
      throw new NotFoundException(`Destination stop with ID '${destinationStopId}' not found`);
    }

    if (origin.id === destination.id) {
      throw new BadRequestException('Origin stop and destination stop cannot be the same');
    }

    const transferRoutes = await this.repo.findTransferRoutes(origin.id, destination.id, limit);
    return {
      origin,
      destination,
      transferRoutes,
    };
  }
}
