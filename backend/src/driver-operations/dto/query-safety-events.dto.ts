import { z } from 'zod';

export const QuerySafetyEventsSchema = z.object({
  driverId: z.string().uuid().optional(),
  vehicleId: z.string().uuid().optional(),
  eventType: z
    .enum([
      'HARSH_BRAKING',
      'OVERSPEED',
      'RAPID_ACCEL',
      'GEOFENCE_VIOLATION',
      'DROWSINESS',
      'HOURS_EXCEEDED',
    ])
    .optional(),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type QuerySafetyEventsDto = z.infer<typeof QuerySafetyEventsSchema>;
