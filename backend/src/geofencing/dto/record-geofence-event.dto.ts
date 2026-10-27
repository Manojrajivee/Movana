import { z } from 'zod';

export const RecordGeofenceEventSchema = z.object({
  geofenceId: z.string().uuid(),
  vehicleId: z.string().uuid(),
  tripId: z.string().uuid().optional(),
  eventType: z.enum(['ENTER', 'EXIT']),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  occurredAt: z.string().datetime().or(z.date()).optional(),
});

export type RecordGeofenceEventDto = z.infer<typeof RecordGeofenceEventSchema>;
