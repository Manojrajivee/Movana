import { z } from 'zod';

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)(:([0-5]\d))?$/;

export const CreateTripScheduleSchema = z.object({
  scheduleCode: z
    .string()
    .min(2, 'scheduleCode must be at least 2 characters')
    .max(50, 'scheduleCode must not exceed 50 characters')
    .regex(/^[A-Za-z0-9_-]+$/, 'scheduleCode must be alphanumeric with dashes or underscores'),
  routeId: z.string().uuid('routeId must be a valid UUID'),
  serviceCalendarId: z.string().uuid('serviceCalendarId must be a valid UUID'),
  departureTime: z
    .string()
    .regex(timeRegex, 'departureTime must be formatted as HH:MM or HH:MM:SS (24-hour)'),
  arrivalTime: z
    .string()
    .regex(timeRegex, 'arrivalTime must be formatted as HH:MM or HH:MM:SS (24-hour)'),
  isActive: z.boolean().optional(),
});

export type CreateTripScheduleDto = z.infer<typeof CreateTripScheduleSchema>;
