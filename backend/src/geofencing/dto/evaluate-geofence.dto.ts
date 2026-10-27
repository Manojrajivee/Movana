import { z } from 'zod';

export const EvaluateGeofenceSchema = z.object({
  vehicleId: z.string().uuid(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  tripId: z.string().uuid().optional(),
  occurredAt: z.string().datetime().or(z.date()).optional(),
});

export type EvaluateGeofenceDto = z.infer<typeof EvaluateGeofenceSchema>;
