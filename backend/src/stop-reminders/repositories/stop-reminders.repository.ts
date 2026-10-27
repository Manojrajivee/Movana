import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { RedisService } from '../../redis/redis.service';

export interface StopReminder {
  id: string;
  userId: string;
  tripId: string;
  tripNumber: string;
  targetStopId: string;
  targetStopName: string;
  targetSequenceNumber: number;
  reminderType: 'STOPS_BEFORE' | 'MINUTES_BEFORE' | 'ON_ARRIVAL';
  reminderValue: number;
  notifyChannel: 'IN_APP' | 'PUSH' | 'SMS';
  isTriggered: boolean;
  triggeredAt: Date | null;
  createdAt: Date;
}

@Injectable()
export class StopRemindersRepository {
  private readonly REMINDER_TTL_SECONDS = 86400; // 24 hours

  constructor(
    private readonly db: DatabaseService,
    private readonly redis: RedisService,
  ) {}

  async findTripInfo(tripId: string): Promise<any | null> {
    const query = `
      SELECT t.*, r.route_code, r.name AS route_name
      FROM trips t
      JOIN routes r ON t.route_id = r.id
      WHERE t.id = $1;
    `;
    const res = await this.db.query(query, [tripId]);
    return res.rows[0] || null;
  }

  async findTripStop(tripId: string, stopId: string): Promise<any | null> {
    const query = `
      SELECT ts.*, s.stop_code, s.name AS stop_name, s.latitude, s.longitude
      FROM trip_stops ts
      JOIN stops s ON ts.stop_id = s.id
      WHERE ts.trip_id = $1 AND ts.stop_id = $2;
    `;
    const res = await this.db.query(query, [tripId, stopId]);
    return res.rows[0] || null;
  }

  async findAllTripStops(tripId: string): Promise<any[]> {
    const query = `
      SELECT ts.*, s.stop_code, s.name AS stop_name, s.latitude, s.longitude
      FROM trip_stops ts
      JOIN stops s ON ts.stop_id = s.id
      WHERE ts.trip_id = $1
      ORDER BY ts.sequence_number ASC;
    `;
    const res = await this.db.query(query, [tripId]);
    return res.rows;
  }

  async saveReminder(reminder: StopReminder): Promise<void> {
    const key = `movana:reminder:${reminder.id}`;
    const payload = JSON.stringify(reminder);

    await this.redis.set(key, payload, this.REMINDER_TTL_SECONDS);
    await this.redis.sadd(`movana:reminders:user:${reminder.userId}`, reminder.id);
    await this.redis.sadd(`movana:reminders:trip:${reminder.tripId}`, reminder.id);
  }

  async findReminderById(id: string): Promise<StopReminder | null> {
    const key = `movana:reminder:${id}`;
    const raw = await this.redis.get(key);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return {
        ...parsed,
        createdAt: new Date(parsed.createdAt),
        triggeredAt: parsed.triggeredAt ? new Date(parsed.triggeredAt) : null,
      };
    } catch {
      return null;
    }
  }

  async findUserReminders(userId: string): Promise<StopReminder[]> {
    const ids = await this.redis.smembers(`movana:reminders:user:${userId}`);
    if (!ids || ids.length === 0) return [];

    const reminders: StopReminder[] = [];
    for (const id of ids) {
      const reminder = await this.findReminderById(id);
      if (reminder) {
        reminders.push(reminder);
      } else {
        // Clean up dead reference
        await this.redis.srem(`movana:reminders:user:${userId}`, id);
      }
    }
    return reminders.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async findTripReminders(tripId: string): Promise<StopReminder[]> {
    const ids = await this.redis.smembers(`movana:reminders:trip:${tripId}`);
    if (!ids || ids.length === 0) return [];

    const reminders: StopReminder[] = [];
    for (const id of ids) {
      const reminder = await this.findReminderById(id);
      if (reminder) {
        reminders.push(reminder);
      } else {
        await this.redis.srem(`movana:reminders:trip:${tripId}`, id);
      }
    }
    return reminders;
  }

  async deleteReminder(id: string, userId: string, tripId: string): Promise<void> {
    await this.redis.del(`movana:reminder:${id}`);
    await this.redis.srem(`movana:reminders:user:${userId}`, id);
    await this.redis.srem(`movana:reminders:trip:${tripId}`, id);
  }
}
