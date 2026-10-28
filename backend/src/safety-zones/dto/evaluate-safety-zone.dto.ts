import { z } from 'zod';

export const EvaluateSafetyZoneSchema = z.object({
  vehicleId: z.string().uuid({ message: 'Valid vehicleId UUID is required' }),
  tripId: z.string().uuid({ message: 'Valid tripId UUID is required' }).optional(),
  latitude: z
    .number()
    .min(-90, { message: 'Latitude must be between -90 and 90' })
    .max(90, { message: 'Latitude must be between -90 and 90' }),
  longitude: z
    .number()
    .min(-180, { message: 'Longitude must be between -180 and 180' })
    .max(180, { message: 'Longitude must be between -180 and 180' }),
  speedKmh: z
    .number()
    .min(0, { message: 'Speed must be greater than or equal to 0' })
    .max(250, { message: 'Speed cannot exceed 250 km/h' }),
  heading: z.number().min(0).max(360).optional(),
  occurredAt: z.string().datetime().optional(),
});

export type EvaluateSafetyZoneDto = z.infer<typeof EvaluateSafetyZoneSchema>;
