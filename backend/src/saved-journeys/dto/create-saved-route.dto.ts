import { z } from 'zod';

export const CreateSavedRouteSchema = z.object({
  name: z.string().trim().min(2).max(100),
  originStopId: z.string().uuid(),
  destinationStopId: z.string().uuid(),
  preferredDepartureTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Must be in HH:mm 24-hour format')
    .optional(),
  daysOfWeek: z
    .array(z.enum(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']))
    .default(['MON', 'TUE', 'WED', 'THU', 'FRI']),
  notifyDelayAlerts: z.boolean().default(true),
});

export type CreateSavedRouteDto = z.infer<typeof CreateSavedRouteSchema>;
