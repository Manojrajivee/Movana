import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { CreateDisruptionDto } from '../dto/create-disruption.dto';
import { QueryDisruptionsDto } from '../dto/query-disruptions.dto';
import { ResolveDisruptionDto } from '../dto/resolve-disruption.dto';
import { UpdateDisruptionDto } from '../dto/update-disruption.dto';
import {
  ServiceDisruption,
  ServiceDisruptionsRepository,
} from '../repositories/service-disruptions.repository';

@Injectable()
export class ServiceDisruptionsService {
  private readonly logger = new Logger(ServiceDisruptionsService.name);

  constructor(private readonly repo: ServiceDisruptionsRepository) {}

  async createDisruption(
    dto: CreateDisruptionDto,
    currentUser: AuthenticatedUser,
  ): Promise<ServiceDisruption> {
    let routeCode: string | null = null;
    let routeName: string | null = null;
    if (dto.routeId) {
      const route = await this.repo.findRouteById(dto.routeId);
      if (!route) {
        throw new NotFoundException(`Route with ID '${dto.routeId}' not found`);
      }
      routeCode = route.route_code;
      routeName = route.name;
    }

    let tripNumber: string | null = null;
    if (dto.tripId) {
      const trip = await this.repo.findTripById(dto.tripId);
      if (!trip) {
        throw new NotFoundException(`Trip with ID '${dto.tripId}' not found`);
      }
      tripNumber = trip.trip_number;
    }

    if (dto.affectedStops && dto.affectedStops.length > 0) {
      for (const stopId of dto.affectedStops) {
        const stop = await this.repo.findStopById(stopId);
        if (!stop) {
          throw new NotFoundException(`Stop with ID '${stopId}' not found`);
        }
      }
    }

    const startsAt = dto.startsAt ? new Date(dto.startsAt) : new Date();
    let endsAt: Date | null = null;
    if (dto.endsAt) {
      endsAt = new Date(dto.endsAt);
      if (endsAt.getTime() <= startsAt.getTime()) {
        throw new BadRequestException('Disruption endsAt timestamp must be after startsAt');
      }
    }

    const disruption: ServiceDisruption = {
      id: randomUUID(),
      title: dto.title,
      description: dto.description,
      disruptionType: dto.disruptionType,
      severity: dto.severity || 'WARNING',
      status: 'ACTIVE',
      routeId: dto.routeId || null,
      routeCode,
      routeName,
      tripId: dto.tripId || null,
      tripNumber,
      affectedStops: dto.affectedStops || [],
      startsAt,
      endsAt,
      resolvedAt: null,
      resolutionNotes: null,
      createdBy: currentUser.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await this.repo.saveDisruption(disruption);
    return disruption;
  }

  async getDisruptions(query: QueryDisruptionsDto): Promise<ServiceDisruption[]> {
    let list: ServiceDisruption[] = [];
    if (query.status === 'ACTIVE') {
      list = await this.repo.findActiveDisruptions();
    } else {
      list = await this.repo.findAllDisruptions();
    }

    if (query.status === 'RESOLVED') {
      list = list.filter((d) => d.status === 'RESOLVED');
    }

    if (query.routeId) {
      list = list.filter((d) => d.routeId === query.routeId);
    }
    if (query.tripId) {
      list = list.filter((d) => d.tripId === query.tripId);
    }
    if (query.severity) {
      list = list.filter((d) => d.severity === query.severity);
    }
    if (query.disruptionType) {
      list = list.filter((d) => d.disruptionType === query.disruptionType);
    }

    return list.slice(0, query.limit);
  }

  async getActiveDisruptions(): Promise<ServiceDisruption[]> {
    return this.repo.findActiveDisruptions();
  }

  async getDisruptionById(id: string): Promise<ServiceDisruption> {
    const disruption = await this.repo.findDisruptionById(id);
    if (!disruption) {
      throw new NotFoundException(`Service disruption with ID '${id}' not found`);
    }
    return disruption;
  }

  async updateDisruption(id: string, dto: UpdateDisruptionDto): Promise<ServiceDisruption> {
    const disruption = await this.repo.findDisruptionById(id);
    if (!disruption) {
      throw new NotFoundException(`Service disruption with ID '${id}' not found`);
    }

    if (disruption.status === 'RESOLVED') {
      throw new BadRequestException('Cannot update a resolved service disruption');
    }

    if (dto.title !== undefined) disruption.title = dto.title;
    if (dto.description !== undefined) disruption.description = dto.description;
    if (dto.severity !== undefined) disruption.severity = dto.severity;
    if (dto.endsAt !== undefined) {
      disruption.endsAt = dto.endsAt ? new Date(dto.endsAt) : null;
    }
    disruption.updatedAt = new Date();

    await this.repo.saveDisruption(disruption);
    return disruption;
  }

  async resolveDisruption(id: string, dto: ResolveDisruptionDto): Promise<ServiceDisruption> {
    const disruption = await this.repo.findDisruptionById(id);
    if (!disruption) {
      throw new NotFoundException(`Service disruption with ID '${id}' not found`);
    }

    if (disruption.status === 'RESOLVED') {
      throw new ConflictException(`Service disruption '${disruption.title}' is already resolved`);
    }

    disruption.status = 'RESOLVED';
    disruption.resolvedAt = new Date();
    disruption.resolutionNotes = dto.resolutionNotes || null;
    disruption.updatedAt = new Date();

    await this.repo.saveDisruption(disruption);
    return disruption;
  }

  async deleteDisruption(id: string): Promise<{ success: boolean; message: string }> {
    const disruption = await this.repo.findDisruptionById(id);
    if (!disruption) {
      throw new NotFoundException(`Service disruption with ID '${id}' not found`);
    }

    await this.repo.deleteDisruption(id, disruption.routeId, disruption.tripId);
    return { success: true, message: 'Service disruption deleted successfully' };
  }
}
