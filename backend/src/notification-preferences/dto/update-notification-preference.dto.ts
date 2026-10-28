import { z } from 'zod';
import {
  NotificationCategoryEnum,
  NotificationChannelEnum,
} from '../../notifications/dto/create-notification.dto';

export const UpdateNotificationPreferenceSchema = z.object({
  channel: NotificationChannelEnum,
  category: NotificationCategoryEnum,
  isEnabled: z.boolean(),
});

export type UpdateNotificationPreferenceDto = z.infer<typeof UpdateNotificationPreferenceSchema>;

export const QuietHoursSchema = z.object({
  enabled: z.boolean(),
  start: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'Quiet hours start must be in HH:mm 24-hour format (e.g. 22:00)',
  }),
  end: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'Quiet hours end must be in HH:mm 24-hour format (e.g. 07:00)',
  }),
  timezone: z.string().min(1).default('UTC'),
});

export type QuietHoursDto = z.infer<typeof QuietHoursSchema>;

export const UpdatePreferencesMatrixSchema = z.object({
  preferences: z.array(UpdateNotificationPreferenceSchema).optional(),
  channelDefaults: z
    .object({
      emailEnabled: z.boolean().optional(),
      smsEnabled: z.boolean().optional(),
      pushEnabled: z.boolean().optional(),
      marketingEnabled: z.boolean().optional(),
      tripUpdatesEnabled: z.boolean().optional(),
    })
    .optional(),
  quietHours: QuietHoursSchema.optional(),
});

export type UpdatePreferencesMatrixDto = z.infer<typeof UpdatePreferencesMatrixSchema>;
