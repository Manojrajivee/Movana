import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { QueryRecentArrivalsDto } from '../dto/query-stop-arrivals.dto';
import { RecordArrivalDto } from '../dto/record-arrival.dto';
import { RecordDepartureDto } from '../dto/record-departure.dto';
import { SkipStopDto } from '../dto/skip-stop.dto';
import {
  RecentStopArrivalEntity,
  StopArrivalsRepository,
  TripStopDetailEntity,
} from '../repositories/stop-arrivals.repository';

export interface TripTimelineResponse {
  tripId: string;
  tripNumber: string;
  routeCode: string;
  routeName: string;
  status: string;
  summary: {
    totalStops: number;
    pendingStops: number;
    arrivedStops: number;
    departedStops: number;
    skippedStops: number;
  };
  stops: Array<
    TripStopDetailEntity & {
      dwellTimeSeconds: number | null;
    }
  >;
}

@Injectable()
export class StopArrivalsService {
  private readonly logger = new Logger(StopArrivalsService.name);

  constructor(private readonly repo: StopArrivalsRepository) {}

  async recordArrival(
    tripId: string,
    stopId: string,
    dto: RecordArrivalDto,
    userId?: string,
  ): Promise<TripStopDetailEntity> {
    const trip = await this.repo.findTripById(tripId);
    if (!trip) {
      throw new NotFoundException(`Trip with ID '${tripId}' not found`);
    }

    if (['COMPLETED', 'CANCELLED'].includes(trip.status)) {
      throw new BadRequestException(`Cannot record stop arrival for a ${trip.status} trip`);
    }

    const tripStop = await this.repo.findTripStop(tripId, stopId);
    if (!tripStop) {
      throw new NotFoundException(`Stop with ID '${stopId}' not found in trip '${tripId}'`);
    }

    if (tripStop.status === 'ARRIVED') {
      throw new ConflictException(`Stop '${tripStop.stop_name}' is already marked as ARRIVED`);
    }
    if (tripStop.status === 'DEPARTED') {
      throw new ConflictException(`Stop '${tripStop.stop_name}' has already DEPARTED`);
    }
    if (tripStop.status === 'SKIPPED') {
      throw new ConflictException(`Stop '${tripStop.stop_name}' was SKIPPED`);
    }

    const arrivedAt = dto.arrivedAt ? new Date(dto.arrivedAt) : new Date();
    const scheduledArr = new Date(tripStop.scheduled_arrival_at).getTime();
    const delayMinutes = Math.max(0, Math.floor((arrivedAt.getTime() - scheduledArr) / 60000));

    return this.repo.recordArrivalTransactional(
      tripId,
      stopId,
      arrivedAt,
      delayMinutes,
      dto.notes,
      userId,
    );
  }

  async recordDeparture(
    tripId: string,
    stopId: string,
    dto: RecordDepartureDto,
    userId?: string,
  ): Promise<TripStopDetailEntity> {
    const trip = await this.repo.findTripById(tripId);
    if (!trip) {
      throw new NotFoundException(`Trip with ID '${tripId}' not found`);
    }

    if (['COMPLETED', 'CANCELLED'].includes(trip.status)) {
      throw new BadRequestException(`Cannot record stop departure for a ${trip.status} trip`);
    }

    const tripStop = await this.repo.findTripStop(tripId, stopId);
    if (!tripStop) {
      throw new NotFoundException(`Stop with ID '${stopId}' not found in trip '${tripId}'`);
    }

    if (tripStop.status === 'PENDING') {
      throw new BadRequestException(
        `Stop '${tripStop.stop_name}' must be ARRIVED before it can DEPART`,
      );
    }
    if (tripStop.status === 'DEPARTED') {
      throw new ConflictException(`Stop '${tripStop.stop_name}' is already marked as DEPARTED`);
    }
    if (tripStop.status === 'SKIPPED') {
      throw new ConflictException(`Stop '${tripStop.stop_name}' was SKIPPED`);
    }

    const departedAt = dto.departedAt ? new Date(dto.departedAt) : new Date();
    if (
      tripStop.actual_arrival_at &&
      departedAt.getTime() < new Date(tripStop.actual_arrival_at).getTime()
    ) {
      throw new BadRequestException('Departure time cannot be before arrival time');
    }

    const allStops = await this.repo.findAllTripStops(tripId);
    const minSeq = Math.min(...allStops.map((s) => s.sequence_number));
    const maxSeq = Math.max(...allStops.map((s) => s.sequence_number));

    const isFirstStop = tripStop.sequence_number === minSeq;
    const isLastStop = tripStop.sequence_number === maxSeq;

    return this.repo.recordDepartureTransactional(
      tripId,
      stopId,
      departedAt,
      isFirstStop,
      isLastStop,
      dto.notes,
      userId,
    );
  }

  async recordSkip(
    tripId: string,
    stopId: string,
    dto: SkipStopDto,
    userId?: string,
  ): Promise<TripStopDetailEntity> {
    const trip = await this.repo.findTripById(tripId);
    if (!trip) {
      throw new NotFoundException(`Trip with ID '${tripId}' not found`);
    }

    if (['COMPLETED', 'CANCELLED'].includes(trip.status)) {
      throw new BadRequestException(`Cannot skip stops for a ${trip.status} trip`);
    }

    const tripStop = await this.repo.findTripStop(tripId, stopId);
    if (!tripStop) {
      throw new NotFoundException(`Stop with ID '${stopId}' not found in trip '${tripId}'`);
    }

    if (['ARRIVED', 'DEPARTED'].includes(tripStop.status)) {
      throw new ConflictException(
        `Cannot skip stop '${tripStop.stop_name}' because it has already ${tripStop.status.toLowerCase()}`,
      );
    }
    if (tripStop.status === 'SKIPPED') {
      throw new ConflictException(`Stop '${tripStop.stop_name}' is already marked as SKIPPED`);
    }

    return this.repo.recordSkipTransactional(tripId, stopId, dto.reason, userId);
  }

  async getTripTimeline(tripId: string): Promise<TripTimelineResponse> {
    const trip = await this.repo.findTripById(tripId);
    if (!trip) {
      throw new NotFoundException(`Trip with ID '${tripId}' not found`);
    }

    const stops = await this.repo.findAllTripStops(tripId);

    let pendingStops = 0;
    let arrivedStops = 0;
    let departedStops = 0;
    let skippedStops = 0;

    const timelineStops = stops.map((stop) => {
      if (stop.status === 'PENDING') pendingStops++;
      else if (stop.status === 'ARRIVED') arrivedStops++;
      else if (stop.status === 'DEPARTED') departedStops++;
      else if (stop.status === 'SKIPPED') skippedStops++;

      let dwellTimeSeconds: number | null = null;
      if (stop.actual_arrival_at && stop.actual_departure_at) {
        dwellTimeSeconds = Math.round(
          (new Date(stop.actual_departure_at).getTime() -
            new Date(stop.actual_arrival_at).getTime()) /
            1000,
        );
      }

      return {
        ...stop,
        dwellTimeSeconds,
      };
    });

    return {
      tripId: trip.id,
      tripNumber: trip.trip_number,
      routeCode: trip.route_code,
      routeName: trip.route_name,
      status: trip.status,
      summary: {
        totalStops: stops.length,
        pendingStops,
        arrivedStops,
        departedStops,
        skippedStops,
      },
      stops: timelineStops,
    };
  }

  async getRecentStopArrivals(
    stopId: string,
    query: QueryRecentArrivalsDto,
  ): Promise<RecentStopArrivalEntity[]> {
    const stop = await this.repo.findStopById(stopId);
    if (!stop) {
      throw new NotFoundException(`Stop with ID '${stopId}' not found`);
    }

    return this.repo.findRecentStopArrivals(stopId, query.hours, query.limit);
  }
}
