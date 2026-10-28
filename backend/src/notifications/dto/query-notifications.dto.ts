import { z } from 'zod';
import { NotificationCategoryEnum, NotificationChannelEnum } from './create-notification.dto';

export const NotificationStatusEnum = z.enum(['QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'READ']);
export type NotificationStatus = z.infer<typeof NotificationStatusEnum>;

export const QueryNotificationsSchema = z.object({
  userId: z.string().uuid().optional(),
  channel: NotificationChannelEnum.optional(),
  category: NotificationCategoryEnum.optional(),
  status: NotificationStatusEnum.optional(),
  unreadOnly: z.union([z.boolean(), z.string().transform((val) => val === 'true')]).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

export type QueryNotificationsDto = z.input<typeof QueryNotificationsSchema>;
export type QueryNotificationsOutput = z.output<typeof QueryNotificationsSchema>;
