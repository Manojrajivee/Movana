import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  CongestionHotspotEntity,
  HourlyDelayEntity,
  RouteOptimizationRepository,
} from '../repositories/route-optimization.repository';

export interface RouteSegmentAnalytics {
  segmentIndex: number;
  fromStopId: string;
  fromStopName: string;
  toStopId: string;
  toStopName: string;
  distanceKm: number;
  estimatedMinutes: number;
  congestionStatus: 'NORMAL' | 'SLOW' | 'BOTTLENECK';
}

export interface RouteOptimizationSummary {
  routeId: string;
  routeCode: string;
  routeName: string;
  totalDistanceKm: number;
  scheduledDurationMinutes: number;
  totalSegments: number;
  efficiencyScore: number;
  networkRating: 'OPTIMAL' | 'MODERATE_DELAYS' | 'SEVERE_BOTTLENECKS';
  segments: RouteSegmentAnalytics[];
}

export interface DepartureRecommendation {
  routeId: string;
  routeCode: string;
  analysisPeriodDays: number;
  bestDepartureWindows: Array<{
    hourWindow: string;
    avgDelayMinutes: number;
    onTimePercentage: number;
  }>;
  peakCongestionWindows: Array<{
    hourWindow: string;
    avgDelayMinutes: number;
    maxDelayMinutes: number;
  }>;
  advisoryNote: string;
}

@Injectable()
export class RouteOptimizationService {
  private readonly logger = new Logger(RouteOptimizationService.name);

  constructor(private readonly repo: RouteOptimizationRepository) {}

  private calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return parseFloat((R * c).toFixed(2));
  }

  async getRouteAnalytics(routeId: string, _timeframeDays = 30): Promise<RouteOptimizationSummary> {
    const route = await this.repo.findRouteById(routeId);
    if (!route) {
      throw new NotFoundException(`Route with ID '${routeId}' not found`);
    }

    const stops = await this.repo.findRouteStops(routeId);
    const segments: RouteSegmentAnalytics[] = [];

    let totalCalculatedDistance = 0;
    for (let i = 0; i < stops.length - 1; i++) {
      const from = stops[i];
      const to = stops[i + 1];
      const dist = this.calculateDistanceKm(
        from.latitude,
        from.longitude,
        to.latitude,
        to.longitude,
      );
      totalCalculatedDistance += dist;

      // Approximate 35 km/h commercial transit speed + 1.5 min dwell
      const estMinutes = Math.max(3, Math.round((dist / 35.0) * 60 + 1.5));
      const status: 'NORMAL' | 'SLOW' | 'BOTTLENECK' =
        estMinutes > 15 ? 'BOTTLENECK' : estMinutes > 10 ? 'SLOW' : 'NORMAL';

      segments.push({
        segmentIndex: i + 1,
        fromStopId: from.stop_id,
        fromStopName: from.stop_name,
        toStopId: to.stop_id,
        toStopName: to.stop_name,
        distanceKm: dist,
        estimatedMinutes: estMinutes,
        congestionStatus: status,
      });
    }

    const bottleneckCount = segments.filter((s) => s.congestionStatus === 'BOTTLENECK').length;
    const efficiencyScore = Math.max(40, Math.round(100 - bottleneckCount * 15));

    let rating: 'OPTIMAL' | 'MODERATE_DELAYS' | 'SEVERE_BOTTLENECKS' = 'OPTIMAL';
    if (efficiencyScore < 70) rating = 'SEVERE_BOTTLENECKS';
    else if (efficiencyScore < 85) rating = 'MODERATE_DELAYS';

    return {
      routeId: route.id,
      routeCode: route.route_code,
      routeName: route.name,
      totalDistanceKm: route.distance_km || parseFloat(totalCalculatedDistance.toFixed(2)),
      scheduledDurationMinutes: route.estimated_duration_minutes,
      totalSegments: segments.length,
      efficiencyScore,
      networkRating: rating,
      segments,
    };
  }

  async getRouteRecommendations(
    routeId: string,
    timeframeDays = 30,
  ): Promise<DepartureRecommendation> {
    const route = await this.repo.findRouteById(routeId);
    if (!route) {
      throw new NotFoundException(`Route with ID '${routeId}' not found`);
    }

    const hourlyData: HourlyDelayEntity[] = await this.repo.getRouteHourlyDelay(
      routeId,
      timeframeDays,
    );

    const sortedByReliability = [...hourlyData].sort(
      (a, b) => a.avg_delay_minutes - b.avg_delay_minutes,
    );
    const sortedByDelay = [...hourlyData].sort((a, b) => b.avg_delay_minutes - a.avg_delay_minutes);

    const bestWindows = sortedByReliability.slice(0, 3).map((h) => ({
      hourWindow: `${String(h.hour_of_day).padStart(2, '0')}:00 - ${String((h.hour_of_day + 1) % 24).padStart(2, '0')}:00`,
      avgDelayMinutes: h.avg_delay_minutes,
      onTimePercentage: h.on_time_percentage,
    }));

    const peakWindows = sortedByDelay.slice(0, 3).map((h) => ({
      hourWindow: `${String(h.hour_of_day).padStart(2, '0')}:00 - ${String((h.hour_of_day + 1) % 24).padStart(2, '0')}:00`,
      avgDelayMinutes: h.avg_delay_minutes,
      maxDelayMinutes: h.max_delay_minutes,
    }));

    const advisory =
      bestWindows.length > 0
        ? `Recommended off-peak dispatch during ${bestWindows[0].hourWindow} for minimal delay. Avoid ${peakWindows[0]?.hourWindow || 'peak evening'} due to elevated traffic.`
        : 'Sufficient historical departure metrics are currently accumulating for this route.';

    return {
      routeId: route.id,
      routeCode: route.route_code,
      analysisPeriodDays: timeframeDays,
      bestDepartureWindows: bestWindows,
      peakCongestionWindows: peakWindows,
      advisoryNote: advisory,
    };
  }

  async getNetworkCongestionHotspots(limit = 10): Promise<CongestionHotspotEntity[]> {
    return this.repo.getNetworkCongestionHotspots(limit);
  }
}
