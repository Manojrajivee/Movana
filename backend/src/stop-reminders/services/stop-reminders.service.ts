import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { CreateStopReminderDto } from '../dto/create-reminder.dto';
import { StopReminder, StopRemindersRepository } from '../repositories/stop-reminders.repository';

export interface TriggeredAlarm {
  reminderId: string;
  userId: string;
  tripId: string;
  tripNumber: string;
  targetStopName: string;
  reminderType: string;
  notifyChannel: string;
  alertMessage: string;
  triggeredAt: Date;
}

@Injectable()
export class StopRemindersService {
  private readonly logger = new Logger(StopRemindersService.name);

  constructor(private readonly repo: StopRemindersRepository) {}

  async createReminder(
    dto: CreateStopReminderDto,
    currentUser: AuthenticatedUser,
  ): Promise<StopReminder> {
    const trip = await this.repo.findTripInfo(dto.tripId);
    if (!trip) {
      throw new NotFoundException(`Trip with ID '${dto.tripId}' not found`);
    }

    if (['COMPLETED', 'CANCELLED'].includes(trip.status)) {
      throw new BadRequestException(`Cannot create a stop reminder for a ${trip.status} trip`);
    }

    const targetStop = await this.repo.findTripStop(dto.tripId, dto.targetStopId);
    if (!targetStop) {
      throw new NotFoundException(
        `Target stop '${dto.targetStopId}' is not part of trip '${dto.tripId}'`,
      );
    }

    if (['DEPARTED', 'SKIPPED'].includes(targetStop.status)) {
      throw new BadRequestException(
        `Cannot create reminder: target stop '${targetStop.stop_name}' has already ${targetStop.status.toLowerCase()}`,
      );
    }

    // Check if duplicate active reminder already exists for this user and stop
    const existingReminders = await this.repo.findUserReminders(currentUser.id);
    const duplicate = existingReminders.find(
      (r) =>
        r.tripId === dto.tripId &&
        r.targetStopId === dto.targetStopId &&
        r.reminderType === dto.reminderType &&
        !r.isTriggered,
    );
    if (duplicate) {
      throw new ConflictException(
        `An active reminder for stop '${targetStop.stop_name}' on this trip already exists`,
      );
    }

    const reminder: StopReminder = {
      id: randomUUID(),
      userId: currentUser.id,
      tripId: dto.tripId,
      tripNumber: trip.trip_number,
      targetStopId: dto.targetStopId,
      targetStopName: targetStop.stop_name,
      targetSequenceNumber: targetStop.sequence_number,
      reminderType: dto.reminderType,
      reminderValue: dto.reminderValue,
      notifyChannel: dto.notifyChannel,
      isTriggered: false,
      triggeredAt: null,
      createdAt: new Date(),
    };

    await this.repo.saveReminder(reminder);
    return reminder;
  }

  async getUserReminders(userId: string): Promise<StopReminder[]> {
    return this.repo.findUserReminders(userId);
  }

  async getReminderById(id: string, currentUser: AuthenticatedUser): Promise<StopReminder> {
    const reminder = await this.repo.findReminderById(id);
    if (!reminder) {
      throw new NotFoundException(`Stop reminder with ID '${id}' not found`);
    }

    const isPrivileged = currentUser.roles.some((r) => ['ADMIN', 'OPERATOR'].includes(r));
    if (reminder.userId !== currentUser.id && !isPrivileged) {
      throw new ForbiddenException('You do not have permission to view this reminder');
    }

    return reminder;
  }

  async deleteReminder(
    id: string,
    currentUser: AuthenticatedUser,
  ): Promise<{ success: boolean; message: string }> {
    const reminder = await this.repo.findReminderById(id);
    if (!reminder) {
      throw new NotFoundException(`Stop reminder with ID '${id}' not found`);
    }

    const isPrivileged = currentUser.roles.some((r) => ['ADMIN', 'OPERATOR'].includes(r));
    if (reminder.userId !== currentUser.id && !isPrivileged) {
      throw new ForbiddenException('You do not have permission to delete this reminder');
    }

    await this.repo.deleteReminder(id, reminder.userId, reminder.tripId);
    return { success: true, message: 'Stop reminder successfully cancelled' };
  }

  async evaluateTripReminders(
    tripId: string,
  ): Promise<{ evaluatedCount: number; triggeredCount: number; alarms: TriggeredAlarm[] }> {
    const trip = await this.repo.findTripInfo(tripId);
    if (!trip) {
      throw new NotFoundException(`Trip with ID '${tripId}' not found`);
    }

    const reminders = await this.repo.findTripReminders(tripId);
    const stops = await this.repo.findAllTripStops(tripId);

    const activeReminders = reminders.filter((r) => !r.isTriggered);
    const triggeredAlarms: TriggeredAlarm[] = [];

    // Find current sequence number of the trip
    let currentSequence = 0;
    if (trip.current_stop_id) {
      const currStop = stops.find((s) => s.stop_id === trip.current_stop_id);
      if (currStop) {
        currentSequence = currStop.sequence_number;
      }
    }
    if (currentSequence === 0) {
      const arrivedStops = stops.filter((s) => ['ARRIVED', 'DEPARTED'].includes(s.status));
      if (arrivedStops.length > 0) {
        currentSequence = Math.max(...arrivedStops.map((s) => s.sequence_number));
      }
    }

    const now = Date.now();

    for (const reminder of activeReminders) {
      const targetStop = stops.find((s) => s.stop_id === reminder.targetStopId);
      if (!targetStop) continue;

      let shouldTrigger = false;
      let alertMessage = '';

      if (reminder.reminderType === 'ON_ARRIVAL') {
        if (targetStop.status === 'ARRIVED') {
          shouldTrigger = true;
          alertMessage = `You have arrived at your destination stop: ${reminder.targetStopName}!`;
        }
      } else if (reminder.reminderType === 'STOPS_BEFORE') {
        const stopsAway = targetStop.sequence_number - currentSequence;
        if (stopsAway > 0 && stopsAway <= reminder.reminderValue) {
          shouldTrigger = true;
          alertMessage = `Approaching stop alert: ${reminder.targetStopName} is ${stopsAway} stop(s) away. Prepare to alight.`;
        }
      } else if (reminder.reminderType === 'MINUTES_BEFORE') {
        const schedArr = new Date(targetStop.scheduled_arrival_at).getTime();
        const minutesRemaining = Math.max(0, Math.floor((schedArr - now) / 60000));
        if (minutesRemaining <= reminder.reminderValue) {
          shouldTrigger = true;
          alertMessage = `Approaching stop alert: Arriving at ${reminder.targetStopName} in approximately ${Math.max(1, minutesRemaining)} minute(s).`;
        }
      }

      if (shouldTrigger) {
        const triggeredAt = new Date();
        reminder.isTriggered = true;
        reminder.triggeredAt = triggeredAt;
        await this.repo.saveReminder(reminder);

        triggeredAlarms.push({
          reminderId: reminder.id,
          userId: reminder.userId,
          tripId: reminder.tripId,
          tripNumber: reminder.tripNumber,
          targetStopName: reminder.targetStopName,
          reminderType: reminder.reminderType,
          notifyChannel: reminder.notifyChannel,
          alertMessage,
          triggeredAt,
        });
      }
    }

    return {
      evaluatedCount: activeReminders.length,
      triggeredCount: triggeredAlarms.length,
      alarms: triggeredAlarms,
    };
  }
}
