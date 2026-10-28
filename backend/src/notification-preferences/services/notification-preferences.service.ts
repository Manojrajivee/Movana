import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';
import {
  NotificationCategory,
  NotificationChannel,
} from '../../notifications/dto/create-notification.dto';
import {
  QuietHoursDto,
  UpdateNotificationPreferenceDto,
  UpdatePreferencesMatrixDto,
} from '../dto/update-notification-preference.dto';
import {
  NotificationPreferenceEntity,
  NotificationPreferencesRepository,
  UserPreferencesRow,
} from '../repositories/notification-preferences.repository';

export interface UserPreferencesProfile {
  userId: string;
  channelSwitches: {
    email: boolean;
    sms: boolean;
    push: boolean;
    inApp: boolean;
    marketing: boolean;
    tripUpdates: boolean;
  };
  categories: Array<{
    channel: NotificationChannel;
    category: string;
    isEnabled: boolean;
  }>;
  quietHours: QuietHoursDto;
}

@Injectable()
export class NotificationPreferencesService {
  private readonly logger = new Logger(NotificationPreferencesService.name);

  constructor(
    private readonly repository: NotificationPreferencesRepository,
    private readonly redisService: RedisService,
  ) {}

  private validateTimezone(tz: string): void {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: tz });
    } catch {
      throw new BadRequestException(
        `Invalid IANA timezone identifier: '${tz}'. Example: 'UTC', 'Asia/Kolkata', 'America/New_York'`,
      );
    }
  }

  async getUserPreferences(userId: string): Promise<UserPreferencesProfile> {
    const preferences = await this.repository.findPreferencesByUserId(userId);
    let channelRow = await this.repository.findUserPreferencesRow(userId);

    if (!channelRow) {
      channelRow = await this.repository.upsertUserPreferencesRow(userId, {});
    }

    const quietHoursKey = `movana:user_quiet_hours:${userId}`;
    const quietHoursRaw = await this.redisService.get(quietHoursKey);
    let quietHours: QuietHoursDto = {
      enabled: false,
      start: '22:00',
      end: '07:00',
      timezone: 'UTC',
    };

    if (quietHoursRaw) {
      try {
        quietHours = JSON.parse(quietHoursRaw);
      } catch (err) {
        this.logger.warn(`Failed to parse quiet hours JSON for user ${userId}`, err);
      }
    }

    return {
      userId,
      channelSwitches: {
        email: channelRow.email_enabled,
        sms: channelRow.sms_enabled,
        push: channelRow.push_enabled,
        inApp: true,
        marketing: channelRow.marketing_enabled,
        tripUpdates: channelRow.trip_updates_enabled,
      },
      categories: preferences.map((p) => ({
        channel: p.channel,
        category: p.notification_category,
        isEnabled: p.is_enabled,
      })),
      quietHours,
    };
  }

  async updateSinglePreference(
    userId: string,
    dto: UpdateNotificationPreferenceDto,
  ): Promise<NotificationPreferenceEntity> {
    // Fail-safe: Critical security alerts on IN_APP cannot be disabled
    if (dto.channel === 'IN_APP' && dto.category === 'SECURITY_ALERT' && !dto.isEnabled) {
      throw new ForbiddenException(
        'Critical security notifications cannot be disabled for the in-app channel.',
      );
    }

    return this.repository.upsertPreference(userId, dto.channel, dto.category, dto.isEnabled);
  }

  async updatePreferencesMatrix(
    userId: string,
    dto: UpdatePreferencesMatrixDto,
  ): Promise<UserPreferencesProfile> {
    // 1. Update individual category matrix
    if (dto.preferences && dto.preferences.length > 0) {
      for (const pref of dto.preferences) {
        if (pref.channel === 'IN_APP' && pref.category === 'SECURITY_ALERT' && !pref.isEnabled) {
          throw new ForbiddenException(
            'Critical security notifications cannot be disabled for the in-app channel.',
          );
        }
        await this.repository.upsertPreference(userId, pref.channel, pref.category, pref.isEnabled);
      }
    }

    // 2. Update master channel switches
    if (dto.channelDefaults) {
      await this.repository.upsertUserPreferencesRow(userId, {
        emailEnabled: dto.channelDefaults.emailEnabled,
        smsEnabled: dto.channelDefaults.smsEnabled,
        pushEnabled: dto.channelDefaults.pushEnabled,
        marketingEnabled: dto.channelDefaults.marketingEnabled,
        tripUpdatesEnabled: dto.channelDefaults.tripUpdatesEnabled,
      });
    }

    // 3. Update quiet hours in Redis
    if (dto.quietHours) {
      this.validateTimezone(dto.quietHours.timezone);
      const quietHoursKey = `movana:user_quiet_hours:${userId}`;
      await this.redisService.set(
        quietHoursKey,
        JSON.stringify(dto.quietHours),
        2592000, // 30 days
      );
    }

    return this.getUserPreferences(userId);
  }

  async resetToDefaults(userId: string): Promise<UserPreferencesProfile> {
    await this.repository.deleteUserPreferences(userId);
    await this.repository.upsertUserPreferencesRow(userId, {
      emailEnabled: true,
      smsEnabled: true,
      pushEnabled: true,
      marketingEnabled: false,
      tripUpdatesEnabled: true,
    });

    const quietHoursKey = `movana:user_quiet_hours:${userId}`;
    await this.redisService.del(quietHoursKey);

    return this.getUserPreferences(userId);
  }

  async isDeliveryPermitted(
    userId: string,
    channel: NotificationChannel,
    category: NotificationCategory,
    checkQuietHours = true,
  ): Promise<{ allowed: boolean; reason?: string }> {
    // 1. Security alerts always bypass preferences and quiet hours
    if (category === 'SECURITY_ALERT') {
      return { allowed: true };
    }

    // 2. Check master channel switch
    const channelRow: UserPreferencesRow | null =
      await this.repository.findUserPreferencesRow(userId);
    if (channelRow) {
      if (channel === 'EMAIL' && !channelRow.email_enabled) {
        return { allowed: false, reason: 'Email channel is disabled by user' };
      }
      if (channel === 'SMS' && !channelRow.sms_enabled) {
        return { allowed: false, reason: 'SMS channel is disabled by user' };
      }
      if (channel === 'PUSH' && !channelRow.push_enabled) {
        return { allowed: false, reason: 'Push channel is disabled by user' };
      }
      if (category === 'PROMOTION' && !channelRow.marketing_enabled) {
        return { allowed: false, reason: 'Marketing notifications are opted-out' };
      }
      if (category === 'TRIP_UPDATE' && !channelRow.trip_updates_enabled) {
        return { allowed: false, reason: 'Trip update alerts are disabled' };
      }
    }

    // 3. Check granular category preference
    const preferences = await this.repository.findPreferencesByUserId(userId);
    const match = preferences.find(
      (p) => p.channel === channel && p.notification_category === category,
    );
    if (match && !match.is_enabled) {
      return {
        allowed: false,
        reason: `User explicitly disabled ${channel} notifications for ${category}`,
      };
    }

    // 4. Quiet hours check
    if (checkQuietHours && channel !== 'IN_APP') {
      const quietHoursKey = `movana:user_quiet_hours:${userId}`;
      const quietHoursRaw = await this.redisService.get(quietHoursKey);
      if (quietHoursRaw) {
        try {
          const qh: QuietHoursDto = JSON.parse(quietHoursRaw);
          if (qh.enabled) {
            const inQuietHours = this.isCurrentTimeInQuietHours(qh.start, qh.end, qh.timezone);
            if (inQuietHours) {
              return {
                allowed: false,
                reason: `Suppressed by user quiet hours schedule (${qh.start} - ${qh.end} ${qh.timezone})`,
              };
            }
          }
        } catch {
          // ignore parsing error and permit
        }
      }
    }

    return { allowed: true };
  }

  private isCurrentTimeInQuietHours(start: string, end: string, timezone: string): boolean {
    try {
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: 'numeric',
        minute: 'numeric',
        hour12: false,
      });
      const parts = formatter.formatToParts(new Date());
      const hour = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10);
      const minute = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10);
      const currentMinutes = hour * 60 + minute;

      const [startH, startM] = start.split(':').map(Number);
      const [endH, endM] = end.split(':').map(Number);
      const startMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;

      if (startMinutes <= endMinutes) {
        // e.g. 01:00 to 06:00
        return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
      } else {
        // Overnight, e.g. 22:00 to 07:00
        return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
      }
    } catch {
      return false;
    }
  }
}
