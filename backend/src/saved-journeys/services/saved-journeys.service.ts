import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { CreateSavedLocationDto } from '../dto/create-saved-location.dto';
import { CreateSavedRouteDto } from '../dto/create-saved-route.dto';
import {
  SavedRouteEntity,
  SavedJourneysRepository,
  UserAddressEntity,
} from '../repositories/saved-journeys.repository';

@Injectable()
export class SavedJourneysService {
  private readonly logger = new Logger(SavedJourneysService.name);

  constructor(private readonly repo: SavedJourneysRepository) {}

  async saveLocation(
    currentUser: AuthenticatedUser,
    dto: CreateSavedLocationDto,
  ): Promise<UserAddressEntity> {
    return this.repo.saveUserAddress(currentUser.id, dto);
  }

  async getUserLocations(userId: string): Promise<UserAddressEntity[]> {
    return this.repo.findUserAddresses(userId);
  }

  async deleteLocation(
    id: string,
    currentUser: AuthenticatedUser,
  ): Promise<{ success: boolean; message: string }> {
    const address = await this.repo.findUserAddressById(id);
    if (!address) {
      throw new NotFoundException(`Saved location with ID '${id}' not found`);
    }

    const isPrivileged = currentUser.roles.some((r) => ['ADMIN', 'OPERATOR'].includes(r));
    if (address.user_id !== currentUser.id && !isPrivileged) {
      throw new ForbiddenException('You do not have permission to delete this saved location');
    }

    await this.repo.deleteUserAddress(id, address.user_id);
    return { success: true, message: 'Saved location successfully deleted' };
  }

  async saveRoute(
    currentUser: AuthenticatedUser,
    dto: CreateSavedRouteDto,
  ): Promise<SavedRouteEntity> {
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

    const savedRoute: SavedRouteEntity = {
      id: randomUUID(),
      userId: currentUser.id,
      name: dto.name,
      originStopId: origin.id,
      originStopName: origin.name,
      destinationStopId: destination.id,
      destinationStopName: destination.name,
      preferredDepartureTime: dto.preferredDepartureTime,
      daysOfWeek: dto.daysOfWeek,
      notifyDelayAlerts: dto.notifyDelayAlerts,
      createdAt: new Date(),
    };

    await this.repo.saveSavedRoute(savedRoute);
    return savedRoute;
  }

  async getUserRoutes(userId: string): Promise<SavedRouteEntity[]> {
    return this.repo.findSavedRoutesByUserId(userId);
  }

  async deleteRoute(
    id: string,
    currentUser: AuthenticatedUser,
  ): Promise<{ success: boolean; message: string }> {
    const route = await this.repo.findSavedRouteById(id);
    if (!route) {
      throw new NotFoundException(`Saved route with ID '${id}' not found`);
    }

    const isPrivileged = currentUser.roles.some((r) => ['ADMIN', 'OPERATOR'].includes(r));
    if (route.userId !== currentUser.id && !isPrivileged) {
      throw new ForbiddenException('You do not have permission to delete this saved route');
    }

    await this.repo.deleteSavedRoute(id, route.userId);
    return { success: true, message: 'Saved route commute deleted successfully' };
  }

  async getNextTripForSavedRoute(
    id: string,
    currentUser: AuthenticatedUser,
  ): Promise<{
    savedRoute: SavedRouteEntity;
    hasActiveTrip: boolean;
    nextTrip: any | null;
  }> {
    const route = await this.repo.findSavedRouteById(id);
    if (!route) {
      throw new NotFoundException(`Saved route with ID '${id}' not found`);
    }

    const isPrivileged = currentUser.roles.some((r) => ['ADMIN', 'OPERATOR'].includes(r));
    if (route.userId !== currentUser.id && !isPrivileged) {
      throw new ForbiddenException('You do not have permission to view this saved route');
    }

    const nextTrip = await this.repo.findNextTripBetweenStops(
      route.originStopId,
      route.destinationStopId,
    );

    return {
      savedRoute: route,
      hasActiveTrip: nextTrip !== null,
      nextTrip,
    };
  }
}
