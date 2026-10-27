import { z } from 'zod';

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)(:([0-5]\d))?$/;

export const UpdateTripScheduleSchema = z.object({
  serviceCalendarId: z.string().uuid('serviceCalendarId must be a valid UUID').optional(),
  departureTime: z
    .string()
    .regex(timeRegex, 'departureTime must be formatted as HH:MM or HH:MM:SS (24-hour)')
    .optional(),
  arrivalTime: z
    .string()
    .regex(timeRegex, 'arrivalTime must be formatted as HH:MM or HH:MM:SS (24-hour)')
    .optional(),
  isActive: z.boolean().optional(),
});

export type UpdateTripScheduleDto = z.infer<typeof UpdateTripScheduleSchema>;
