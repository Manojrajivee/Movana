import { z } from 'zod';

export const QueryGeofenceEventsSchema = z.object({
  geofenceId: z.string().uuid().optional(),
  vehicleId: z.string().uuid().optional(),
  tripId: z.string().uuid().optional(),
  eventType: z.enum(['ENTER', 'EXIT']).optional(),
  startTime: z
    .string()
    .datetime()
    .optional()
    .transform((val) => (val ? new Date(val) : undefined)),
  endTime: z
    .string()
    .datetime()
    .optional()
    .transform((val) => (val ? new Date(val) : undefined)),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

export type QueryGeofenceEventsDto = z.infer<typeof QueryGeofenceEventsSchema>;
