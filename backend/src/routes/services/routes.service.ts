import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { CreateRouteVersionDto } from '../dto/create-route-version.dto';
import { CreateRouteDto } from '../dto/create-route.dto';
import { QueryRoutesDto } from '../dto/query-routes.dto';
import { UpdateRouteStatusDto } from '../dto/update-route-status.dto';
import { UpdateRouteDto } from '../dto/update-route.dto';
import {
  RouteEntity,
  RouteVersionEntity,
  RoutesRepository,
} from '../repositories/routes.repository';

@Injectable()
export class RoutesService {
  private readonly logger = new Logger(RoutesService.name);

  constructor(
    private readonly repo: RoutesRepository,
    private readonly db: DatabaseService,
  ) {}

  async createRoute(dto: CreateRouteDto): Promise<RouteEntity> {
    const existing = await this.repo.findByCode(dto.routeCode);
    if (existing) {
      throw new ConflictException(`Route with code '${dto.routeCode}' already exists`);
    }

    if (dto.originStopId === dto.destinationStopId) {
      throw new BadRequestException('originStopId and destinationStopId must be different stops');
    }

    const originStop = await this.repo.findStopById(dto.originStopId);
    if (!originStop) {
      throw new NotFoundException(`Origin stop with ID '${dto.originStopId}' not found`);
    }

    const destinationStop = await this.repo.findStopById(dto.destinationStopId);
    if (!destinationStop) {
      throw new NotFoundException(`Destination stop with ID '${dto.destinationStopId}' not found`);
    }

    this.logger.log(`Creating master route ${dto.routeCode}: ${dto.name}`);

    return this.db.withTransaction(async (client) => {
      const route = await this.repo.createRoute(
        {
          routeCode: dto.routeCode,
          name: dto.name,
          description: dto.description,
          originStopId: dto.originStopId,
          destinationStopId: dto.destinationStopId,
          distanceKm: dto.distanceKm,
          estimatedDurationMinutes: dto.estimatedDurationMinutes,
          status: dto.status,
        },
        client,
      );

      await this.repo.createRouteVersion(
        {
          routeId: route.id,
          versionNumber: 1,
          isCurrent: true,
          changeNotes: 'Initial route topology creation',
        },
        client,
      );

      return {
        ...route,
        origin_stop_name: originStop.name,
        origin_stop_city: originStop.city,
        destination_stop_name: destinationStop.name,
        destination_stop_city: destinationStop.city,
        current_version_number: 1,
      };
    });
  }

  async getRoutes(query: QueryRoutesDto) {
    return this.repo.findAll({
      status: query.status,
      originStopId: query.originStopId,
      destinationStopId: query.destinationStopId,
      search: query.search,
      limit: query.limit,
      offset: query.offset,
    });
  }

  async getRouteById(id: string): Promise<RouteEntity> {
    const route = await this.repo.findById(id);
    if (!route || route.deleted_at) {
      throw new NotFoundException(`Route with ID '${id}' not found`);
    }
    return route;
  }

  async updateRoute(id: string, dto: UpdateRouteDto): Promise<RouteEntity> {
    await this.getRouteById(id);
    this.logger.log(`Updating route details for ID '${id}'`);
    const updated = await this.repo.updateRoute(id, dto);
    if (!updated) {
      throw new NotFoundException(`Route with ID '${id}' not found`);
    }
    return updated;
  }

  async updateRouteStatus(id: string, dto: UpdateRouteStatusDto): Promise<RouteEntity> {
    await this.getRouteById(id);
    this.logger.log(`Updating route '${id}' status to '${dto.status}'`);
    const updated = await this.repo.updateRouteStatus(id, dto.status);
    if (!updated) {
      throw new NotFoundException(`Route with ID '${id}' not found`);
    }
    return updated;
  }

  async deleteRoute(id: string): Promise<RouteEntity> {
    await this.getRouteById(id);
    this.logger.log(`Soft-deleting route with ID '${id}'`);
    const deleted = await this.repo.softDelete(id);
    if (!deleted) {
      throw new NotFoundException(`Route with ID '${id}' not found`);
    }
    return deleted;
  }

  async createRouteVersion(id: string, dto: CreateRouteVersionDto): Promise<RouteVersionEntity> {
    await this.getRouteById(id);

    return this.db.withTransaction(async (client) => {
      const maxVer = await this.repo.getLatestVersionNumber(id, client);
      const nextVersion = maxVer + 1;

      await this.repo.deprecatePreviousVersions(id, client);

      this.logger.log(`Publishing route version ${nextVersion} for route ID '${id}'`);
      return this.repo.createRouteVersion(
        {
          routeId: id,
          versionNumber: nextVersion,
          effectiveFrom: dto.effectiveFrom,
          effectiveTo: dto.effectiveTo,
          isCurrent: true,
          changeNotes: dto.changeNotes,
        },
        client,
      );
    });
  }

  async getRouteVersions(id: string): Promise<RouteVersionEntity[]> {
    await this.getRouteById(id);
    return this.repo.findVersionsByRouteId(id);
  }
}
