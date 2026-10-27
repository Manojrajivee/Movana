import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EtaRepository } from '../repositories/eta.repository';

export interface StopEtaResult {
  sequenceNumber: number;
  stopId: string;
  stopCode: string;
  stopName: string;
  status: string;
  scheduledArrivalAt: Date;
  scheduledDepartureAt: Date;
  actualArrivalAt: Date | null;
  actualDepartureAt: Date | null;
  estimatedArrivalAt: Date;
  remainingDistanceKm: number;
  estimatedTravelMinutes: number;
  varianceMinutes: number;
  statusIndicator: 'ON_TIME' | 'DELAYED' | 'EARLY';
}

export interface TripEtaResponse {
  tripId: string;
  tripNumber: string;
  routeCode: string;
  routeName: string;
  vehicleCode: string | null;
  currentPosition: {
    latitude: number | null;
    longitude: number | null;
  };
  tripStatus: string;
  overallDelayMinutes: number;
  stopsEta: StopEtaResult[];
}

export interface StopArrivalPrediction {
  tripId: string;
  tripNumber: string;
  routeCode: string;
  routeName: string;
  vehicleCode: string | null;
  tripStatus: string;
  scheduledArrivalAt: Date;
  estimatedArrivalAt: Date;
  remainingDistanceKm: number;
  estimatedTravelMinutes: number;
  varianceMinutes: number;
  statusIndicator: 'ON_TIME' | 'DELAYED' | 'EARLY';
}

@Injectable()
export class EtaService {
  private readonly logger = new Logger(EtaService.name);
  private readonly DEFAULT_TRANSIT_SPEED_KMH = 35.0; // Average commercial transit speed
  private readonly STOP_DWELL_MINUTES = 1.5; // Dwell time per intermediate stop

  constructor(private readonly repo: EtaRepository) {}

  private calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const R = 6371; // Earth radius in km
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return parseFloat((R * c).toFixed(2));
  }

  async getTripEta(tripId: string): Promise<TripEtaResponse> {
    const trip = await this.repo.findTripForEta(tripId);
    if (!trip) {
      throw new NotFoundException(`Trip with ID '${tripId}' not found`);
    }

    const stops = await this.repo.findTripStopsForEta(tripId);

    const refLat = trip.vehicle_lat ?? trip.trip_lat ?? stops[0]?.latitude ?? null;
    const refLon = trip.vehicle_lon ?? trip.trip_lon ?? stops[0]?.longitude ?? null;

    let cumulativeDistance = 0;
    let intermediatePendingStops = 0;
    let prevLat = refLat;
    let prevLon = refLon;

    const now = Date.now();

    const stopsEta: StopEtaResult[] = stops.map((stop) => {
      const isCompleted = stop.status === 'ARRIVED' || stop.status === 'DEPARTED';

      if (isCompleted) {
        return {
          sequenceNumber: stop.sequence_number,
          stopId: stop.stop_id,
          stopCode: stop.stop_code,
          stopName: stop.stop_name,
          status: stop.status,
          scheduledArrivalAt: stop.scheduled_arrival_at,
          scheduledDepartureAt: stop.scheduled_departure_at,
          actualArrivalAt: stop.actual_arrival_at,
          actualDepartureAt: stop.actual_departure_at,
          estimatedArrivalAt: stop.actual_arrival_at ?? stop.scheduled_arrival_at,
          remainingDistanceKm: 0,
          estimatedTravelMinutes: 0,
          varianceMinutes: stop.delay_minutes,
          statusIndicator: stop.delay_minutes > 3 ? 'DELAYED' : 'ON_TIME',
        };
      }

      // Calculate distance from previous waypoint
      if (prevLat !== null && prevLon !== null) {
        const segDist = this.calculateDistanceKm(prevLat, prevLon, stop.latitude, stop.longitude);
        cumulativeDistance += segDist;
      }

      prevLat = stop.latitude;
      prevLon = stop.longitude;
      intermediatePendingStops++;

      const travelTimeMinutes =
        (cumulativeDistance / this.DEFAULT_TRANSIT_SPEED_KMH) * 60 +
        intermediatePendingStops * this.STOP_DWELL_MINUTES;

      const estimatedArrivalTimestamp = now + travelTimeMinutes * 60000;
      const estimatedArrivalAt = new Date(estimatedArrivalTimestamp);

      const varianceMinutes = Math.round(
        (estimatedArrivalAt.getTime() - new Date(stop.scheduled_arrival_at).getTime()) / 60000,
      );

      let statusIndicator: 'ON_TIME' | 'DELAYED' | 'EARLY' = 'ON_TIME';
      if (varianceMinutes > 3) {
        statusIndicator = 'DELAYED';
      } else if (varianceMinutes < -3) {
        statusIndicator = 'EARLY';
      }

      return {
        sequenceNumber: stop.sequence_number,
        stopId: stop.stop_id,
        stopCode: stop.stop_code,
        stopName: stop.stop_name,
        status: stop.status,
        scheduledArrivalAt: stop.scheduled_arrival_at,
        scheduledDepartureAt: stop.scheduled_departure_at,
        actualArrivalAt: stop.actual_arrival_at,
        actualDepartureAt: stop.actual_departure_at,
        estimatedArrivalAt,
        remainingDistanceKm: parseFloat(cumulativeDistance.toFixed(2)),
        estimatedTravelMinutes: Math.round(travelTimeMinutes),
        varianceMinutes,
        statusIndicator,
      };
    });

    return {
      tripId: trip.trip_id,
      tripNumber: trip.trip_number,
      routeCode: trip.route_code,
      routeName: trip.route_name,
      vehicleCode: trip.vehicle_code,
      currentPosition: {
        latitude: refLat,
        longitude: refLon,
      },
      tripStatus: trip.status,
      overallDelayMinutes: trip.delay_minutes,
      stopsEta,
    };
  }

  async getStopEta(stopId: string): Promise<StopArrivalPrediction[]> {
    const approaching = await this.repo.findApproachingTripsForStop(stopId);
    const now = Date.now();

    const predictions: StopArrivalPrediction[] = approaching.map((trip) => {
      let remainingDistanceKm = 0;
      if (trip.current_latitude !== null && trip.current_longitude !== null) {
        remainingDistanceKm = this.calculateDistanceKm(
          trip.current_latitude,
          trip.current_longitude,
          trip.stop_latitude,
          trip.stop_longitude,
        );
      }

      const travelMinutes = (remainingDistanceKm / this.DEFAULT_TRANSIT_SPEED_KMH) * 60;
      const estimatedArrivalAt = new Date(now + travelMinutes * 60000);
      const varianceMinutes = Math.round(
        (estimatedArrivalAt.getTime() - new Date(trip.scheduled_arrival_at).getTime()) / 60000,
      );

      let statusIndicator: 'ON_TIME' | 'DELAYED' | 'EARLY' = 'ON_TIME';
      if (varianceMinutes > 3) {
        statusIndicator = 'DELAYED';
      } else if (varianceMinutes < -3) {
        statusIndicator = 'EARLY';
      }

      return {
        tripId: trip.trip_id,
        tripNumber: trip.trip_number,
        routeCode: trip.route_code,
        routeName: trip.route_name,
        vehicleCode: trip.vehicle_code,
        tripStatus: trip.trip_status,
        scheduledArrivalAt: trip.scheduled_arrival_at,
        estimatedArrivalAt,
        remainingDistanceKm,
        estimatedTravelMinutes: Math.round(travelMinutes),
        varianceMinutes,
        statusIndicator,
      };
    });

    return predictions.sort(
      (a, b) => a.estimatedArrivalAt.getTime() - b.estimatedArrivalAt.getTime(),
    );
  }
}
