import { z } from 'zod';

export const NotificationChannelEnum = z.enum(['IN_APP', 'EMAIL', 'SMS', 'PUSH']);
export type NotificationChannel = z.infer<typeof NotificationChannelEnum>;

export const NotificationCategoryEnum = z.enum([
  'TRIP_UPDATE',
  'DELAY_ALERT',
  'DISRUPTION',
  'BOOKING_CONFIRMATION',
  'PAYMENT_RECEIPT',
  'SECURITY_ALERT',
  'PROMOTION',
  'SYSTEM',
]);
export type NotificationCategory = z.infer<typeof NotificationCategoryEnum>;

export const CreateNotificationSchema = z.object({
  userId: z.string().uuid({ message: 'Valid userId UUID is required' }),
  title: z
    .string()
    .min(1, { message: 'Title is required' })
    .max(200, { message: 'Title cannot exceed 200 characters' }),
  message: z.string().min(1, { message: 'Message cannot be empty' }),
  channel: NotificationChannelEnum.optional().default('IN_APP'),
  category: NotificationCategoryEnum.optional().default('SYSTEM'),
  metadata: z.record(z.any()).optional(),
  scheduledFor: z.string().datetime({ offset: true }).optional(),
  recipientAddress: z.string().max(255).optional(),
  idempotencyKey: z.string().max(100).optional(),
});

export type CreateNotificationDto = z.input<typeof CreateNotificationSchema>;
export type CreateNotificationOutput = z.output<typeof CreateNotificationSchema>;
