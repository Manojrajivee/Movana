import { z } from 'zod';

export const CreateStopReminderSchema = z.object({
  tripId: z.string().uuid('tripId must be a valid UUID'),
  targetStopId: z.string().uuid('targetStopId must be a valid UUID'),
  reminderType: z.enum(['STOPS_BEFORE', 'MINUTES_BEFORE', 'ON_ARRIVAL'], {
    errorMap: () => ({
      message: 'reminderType must be one of: STOPS_BEFORE, MINUTES_BEFORE, ON_ARRIVAL',
    }),
  }),
  reminderValue: z.coerce.number().int().min(0).max(60).default(1),
  notifyChannel: z.enum(['IN_APP', 'PUSH', 'SMS']).default('IN_APP'),
});

export type CreateStopReminderDto = z.infer<typeof CreateStopReminderSchema>;
