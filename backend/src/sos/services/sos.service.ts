import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { NotificationsService } from '../../notifications/services/notifications.service';
import { RealTimeService } from '../../real-time/services/real-time.service';
import { RedisService } from '../../redis/redis.service';
import { CreateEmergencyContactDto } from '../dto/emergency-contact.dto';
import { TriggerSosDto, UpdateSosStatusDto } from '../dto/trigger-sos.dto';
import {
  EmergencyContactEntity,
  EmergencyEventEntity,
  SosRepository,
} from '../repositories/sos.repository';

export interface TriggerSosResult {
  event: EmergencyEventEntity;
  contactsNotified: number;
  duplicateSuppressed: boolean;
}

@Injectable()
export class SosService {
  private readonly logger = new Logger(SosService.name);

  constructor(
    private readonly repository: SosRepository,
    private readonly notificationsService: NotificationsService,
    private readonly realTimeService: RealTimeService,
    private readonly redisService: RedisService,
  ) {}

  private isStaffRole(user: any): boolean {
    const roles: string[] = user?.roles || [];
    return (
      roles.includes('ADMIN') || roles.includes('OPERATOR') || roles.includes('SAFETY_OFFICER')
    );
  }

  async triggerSos(dto: TriggerSosDto, currentUser: any): Promise<TriggerSosResult> {
    // 1. Referential integrity validation against PostgreSQL schema
    const tripExists = await this.repository.validateTripExists(dto.tripId);
    if (!tripExists) {
      throw new NotFoundException(`Trip '${dto.tripId}' not found`);
    }

    const vehicleExists = await this.repository.validateVehicleExists(dto.vehicleId);
    if (!vehicleExists) {
      throw new NotFoundException(`Vehicle '${dto.vehicleId}' not found`);
    }

    // Resolve driver ID from trip if not explicitly provided
    let driverId = dto.driverId;
    if (!driverId) {
      driverId = (await this.repository.resolveDriverIdForTrip(dto.tripId)) || undefined;
    }

    // 2. Safe Redis Deduplication / Throttling check (Fail-Open)
    // Never silently suppress a legitimate emergency on Redis error
    const throttleKey = `movana:sos:throttle:${currentUser.id}:${dto.tripId}`;
    try {
      const throttled = await this.redisService.get(throttleKey);
      if (throttled) {
        const existingEvent = await this.repository.findLatestActiveEventForUser(
          currentUser.id,
          dto.tripId,
        );
        if (existingEvent) {
          this.logger.warn(
            `Duplicate SOS trigger suppressed for user ${currentUser.id} within throttle window`,
          );
          return {
            event: existingEvent,
            contactsNotified: 0,
            duplicateSuppressed: true,
          };
        }
      }
    } catch (err: any) {
      this.logger.warn(
        `Redis unavailable during SOS throttle check: ${err.message}. Proceeding with fail-open emergency creation.`,
      );
    }

    // 3. Create persistent Emergency Event in PostgreSQL
    const event = await this.repository.createEmergencyEvent(dto, currentUser.id, driverId);

    // 4. Set Redis throttle window (10 seconds)
    try {
      await this.redisService.set(throttleKey, event.id, 10);
    } catch (err: any) {
      this.logger.warn(`Failed to set Redis throttle key for SOS ${event.id}: ${err.message}`);
    }

    // 5. Broadcast real-time emergency alert to operations room
    try {
      await this.realTimeService.publishToRoom('operations', 'emergency_alert', {
        eventId: event.id,
        userId: currentUser.id,
        tripId: event.trip_id,
        vehicleId: event.vehicle_id,
        driverId: event.driver_id,
        emergencyType: event.emergency_type,
        status: event.status,
        latitude: event.latitude,
        longitude: event.longitude,
        triggeredAt: event.triggered_at,
      });
    } catch (err: any) {
      this.logger.warn(
        `Failed to broadcast real-time emergency alert for ${event.id}: ${err.message}`,
      );
    }

    // 6. Notify emergency contacts if requested
    let contactsNotified = 0;
    if (dto.notifyContacts !== false) {
      try {
        const contacts = await this.repository.findContactsByUserId(currentUser.id);
        for (const contact of contacts) {
          try {
            await this.notificationsService.dispatch(
              {
                userId: currentUser.id,
                title: 'EMERGENCY ALERT: Panic SOS Triggered',
                message: `Emergency SOS triggered for passenger on trip. Vehicle ID: ${dto.vehicleId}. Immediate assistance requested.`,
                channel: contact.phone ? 'SMS' : contact.email ? 'EMAIL' : 'IN_APP',
                category: 'SECURITY_ALERT',
                recipientAddress: contact.phone || contact.email || undefined,
                metadata: {
                  eventId: event.id,
                  tripId: event.trip_id,
                  vehicleId: event.vehicle_id,
                  emergencyType: event.emergency_type,
                },
              },
              currentUser,
            );
            contactsNotified++;
          } catch (notifErr: any) {
            this.logger.warn(
              `Failed to dispatch emergency notification to contact ${contact.id}: ${notifErr.message}`,
            );
          }
        }
      } catch (err: any) {
        this.logger.warn(
          `Failed to retrieve emergency contacts for user ${currentUser.id}: ${err.message}`,
        );
      }
    }

    return {
      event,
      contactsNotified,
      duplicateSuppressed: false,
    };
  }

  async getActiveEmergencies(currentUser: any): Promise<EmergencyEventEntity[]> {
    if (!this.isStaffRole(currentUser)) {
      throw new ForbiddenException(
        'Access denied: active emergency monitoring requires operations authorization.',
      );
    }
    return this.repository.findActiveEmergencyEvents();
  }

  async getEmergencyById(id: string, currentUser: any): Promise<EmergencyEventEntity> {
    const event = await this.repository.findEmergencyEventById(id);
    if (!event) {
      throw new NotFoundException(`Emergency event '${id}' not found`);
    }

    const isOwner = currentUser.id === event.user_id;
    const isStaff = this.isStaffRole(currentUser);
    if (!isOwner && !isStaff) {
      throw new ForbiddenException(
        'Access denied: cannot view emergency event belonging to another user.',
      );
    }

    return event;
  }

  async updateEmergencyStatus(
    id: string,
    dto: UpdateSosStatusDto,
    currentUser: any,
  ): Promise<EmergencyEventEntity> {
    if (!this.isStaffRole(currentUser)) {
      throw new ForbiddenException(
        'Access denied: updating emergency status requires operations authorization.',
      );
    }

    const event = await this.repository.findEmergencyEventById(id);
    if (!event) {
      throw new NotFoundException(`Emergency event '${id}' not found`);
    }

    // Validate state-machine transition
    if (event.status === 'RESOLVED' || event.status === 'FALSE_ALARM') {
      throw new ConflictException(
        `Cannot change status of emergency event '${id}': event is already in terminal state '${event.status}'.`,
      );
    }

    const resolvedAt =
      dto.status === 'RESOLVED' || dto.status === 'FALSE_ALARM' ? new Date().toISOString() : null;

    const updated = await this.repository.updateEmergencyStatus(id, dto.status, resolvedAt);

    // Broadcast status change
    try {
      await this.realTimeService.publishToRoom('operations', 'emergency_status_changed', {
        eventId: updated!.id,
        previousStatus: event.status,
        newStatus: updated!.status,
        resolvedAt: updated!.resolved_at,
        updatedBy: currentUser.id,
      });
    } catch (err: any) {
      this.logger.warn(`Failed to broadcast emergency status change: ${err.message}`);
    }

    return updated!;
  }

  // Emergency Contacts
  async addEmergencyContact(
    dto: CreateEmergencyContactDto,
    currentUser: any,
  ): Promise<EmergencyContactEntity> {
    return this.repository.createEmergencyContact(currentUser.id, dto);
  }

  async getEmergencyContacts(currentUser: any): Promise<EmergencyContactEntity[]> {
    return this.repository.findContactsByUserId(currentUser.id);
  }

  async deleteEmergencyContact(id: string, currentUser: any): Promise<{ success: boolean }> {
    const contact = await this.repository.findContactById(id);
    if (!contact) {
      throw new NotFoundException(`Emergency contact '${id}' not found`);
    }

    if (contact.user_id !== currentUser.id && !this.isStaffRole(currentUser)) {
      throw new ForbiddenException(
        'Access denied: cannot delete contact belonging to another user.',
      );
    }

    await this.repository.deleteContact(id, contact.user_id);
    return { success: true };
  }
}
