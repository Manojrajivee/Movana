import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PlanMultiModalDto } from '../dto/plan-multi-modal.dto';
import {
  HubRouteConnectionEntity,
  MultiModalHubEntity,
  MultiModalRepository,
} from '../repositories/multi-modal.repository';

export interface TransitModeDefinition {
  mode: string;
  displayName: string;
  averageSpeedKmh: number;
  boardingBufferMinutes: number;
  accessibilityTier: string;
  co2GramsPerPassengerKm: number;
  description: string;
}

export interface MultiModalLeg {
  legIndex: number;
  mode: 'BUS_RAPID_TRANSIT' | 'CITY_BUS' | 'EXPRESS_COACH' | 'METRO_FEEDER' | 'WALKING_CONNECTION';
  fromStopName: string;
  toStopName: string;
  durationMinutes: number;
  distanceKm: number;
  routeCode?: string;
  instruction: string;
}

export interface MultiModalItinerary {
  itineraryId: string;
  totalDurationMinutes: number;
  totalDistanceKm: number;
  walkingDistanceMeters: number;
  totalLegs: number;
  modalBreakdown: Record<string, string>;
  legs: MultiModalLeg[];
}

@Injectable()
export class MultiModalService {
  private readonly logger = new Logger(MultiModalService.name);

  constructor(private readonly repo: MultiModalRepository) {}

  getSupportedModes(): TransitModeDefinition[] {
    return [
      {
        mode: 'BUS_RAPID_TRANSIT',
        displayName: 'Bus Rapid Transit (BRT)',
        averageSpeedKmh: 35.0,
        boardingBufferMinutes: 3,
        accessibilityTier: 'FULL_WHEELCHAIR_ACCESSIBLE',
        co2GramsPerPassengerKm: 38.5,
        description: 'Dedicated grade-separated busways offering rapid cross-city transit.',
      },
      {
        mode: 'CITY_BUS',
        displayName: 'City Bus Transit',
        averageSpeedKmh: 22.0,
        boardingBufferMinutes: 2,
        accessibilityTier: 'STANDARD_LOW_FLOOR',
        co2GramsPerPassengerKm: 52.0,
        description: 'Comprehensive municipal bus network connecting arterial urban streets.',
      },
      {
        mode: 'EXPRESS_COACH',
        displayName: 'Regional Express Coach',
        averageSpeedKmh: 50.0,
        boardingBufferMinutes: 5,
        accessibilityTier: 'ELEVATED_COACH_LIFT',
        co2GramsPerPassengerKm: 32.0,
        description: 'High-speed point-to-point intercity coaches operating on expressways.',
      },
      {
        mode: 'METRO_FEEDER',
        displayName: 'Metro Last-Mile Feeder',
        averageSpeedKmh: 24.0,
        boardingBufferMinutes: 2,
        accessibilityTier: 'FULL_WHEELCHAIR_ACCESSIBLE',
        co2GramsPerPassengerKm: 42.0,
        description:
          'Dedicated short-radius feeder shuttles connecting neighborhoods to rail and metro stations.',
      },
      {
        mode: 'WALKING_CONNECTION',
        displayName: 'Pedestrian Transfer Walk',
        averageSpeedKmh: 4.5,
        boardingBufferMinutes: 0,
        accessibilityTier: 'RAMP_SIDEWALK',
        co2GramsPerPassengerKm: 0.0,
        description:
          'Short walkable pedestrian connections between adjacent terminal platforms and interchange hubs.',
      },
    ];
  }

  async getInterchangeHubs(limit = 20): Promise<MultiModalHubEntity[]> {
    return this.repo.findInterchangeHubs(limit);
  }

  async getHubConnections(
    stopId: string,
  ): Promise<{ hub: any; connectionsCount: number; routes: HubRouteConnectionEntity[] }> {
    const stop = await this.repo.findStopById(stopId);
    if (!stop) {
      throw new NotFoundException(`Stop with ID '${stopId}' not found`);
    }

    const routes = await this.repo.findHubConnections(stopId);
    return {
      hub: stop,
      connectionsCount: routes.length,
      routes,
    };
  }

  async planMultiModalJourney(dto: PlanMultiModalDto): Promise<{
    origin: any;
    destination: any;
    itineraries: MultiModalItinerary[];
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

    const itineraries: MultiModalItinerary[] = [];

    // 1. Direct Transit Option
    const direct = await this.repo.findDirectRouteOption(origin.id, destination.id);
    if (direct) {
      itineraries.push({
        itineraryId: `mm-direct-${direct.route_code}`,
        totalDurationMinutes: direct.duration_minutes,
        totalDistanceKm: direct.distance_km,
        walkingDistanceMeters: 0,
        totalLegs: 1,
        modalBreakdown: {
          BUS_RAPID_TRANSIT: '100%',
        },
        legs: [
          {
            legIndex: 1,
            mode: 'BUS_RAPID_TRANSIT',
            fromStopName: origin.name,
            toStopName: destination.name,
            durationMinutes: direct.duration_minutes,
            distanceKm: direct.distance_km,
            routeCode: direct.route_code,
            instruction: `Board route ${direct.route_code} (${direct.route_name}) directly to ${destination.name}`,
          },
        ],
      });
    }

    // 2. Intermodal / Transfer Connection
    if (!dto.preferDirect || itineraries.length === 0) {
      const conn = await this.repo.findConnectingHub(origin.id, destination.id);
      if (conn) {
        const leg1Duration = Math.max(8, conn.leg1_stops * 3);
        const leg2Duration = Math.max(8, conn.leg2_stops * 3);
        const transferWalkDuration = 5; // 5 mins pedestrian interchange walk
        const totalDuration = leg1Duration + transferWalkDuration + leg2Duration;
        const totalDist = parseFloat(((conn.leg1_stops + conn.leg2_stops) * 1.5 + 0.3).toFixed(2));

        itineraries.push({
          itineraryId: `mm-intermodal-${conn.leg1_route_code}-${conn.leg2_route_code}`,
          totalDurationMinutes: totalDuration,
          totalDistanceKm: totalDist,
          walkingDistanceMeters: 300,
          totalLegs: 3,
          modalBreakdown: {
            BUS_RAPID_TRANSIT: '48%',
            WALKING_CONNECTION: '4%',
            METRO_FEEDER: '48%',
          },
          legs: [
            {
              legIndex: 1,
              mode: 'BUS_RAPID_TRANSIT',
              fromStopName: origin.name,
              toStopName: conn.hub_name,
              durationMinutes: leg1Duration,
              distanceKm: parseFloat((conn.leg1_stops * 1.5).toFixed(2)),
              routeCode: conn.leg1_route_code,
              instruction: `Take route ${conn.leg1_route_code} (${conn.leg1_route_name}) to interchange hub ${conn.hub_name}`,
            },
            {
              legIndex: 2,
              mode: 'WALKING_CONNECTION',
              fromStopName: `${conn.hub_name} Terminal`,
              toStopName: `${conn.hub_name} Transfer Bay`,
              durationMinutes: transferWalkDuration,
              distanceKm: 0.3,
              instruction: `Walk 300m via covered pedestrian concourse at ${conn.hub_name} to Transfer Bay`,
            },
            {
              legIndex: 3,
              mode: 'METRO_FEEDER',
              fromStopName: conn.hub_name,
              toStopName: destination.name,
              durationMinutes: leg2Duration,
              distanceKm: parseFloat((conn.leg2_stops * 1.5).toFixed(2)),
              routeCode: conn.leg2_route_code,
              instruction: `Board connecting feeder route ${conn.leg2_route_code} to final destination ${destination.name}`,
            },
          ],
        });
      }
    }

    return {
      origin,
      destination,
      itineraries,
    };
  }
}
