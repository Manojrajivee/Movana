import { z } from 'zod';

export const CreateGeofenceSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().max(500).optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  radiusMeters: z.number().int().positive().max(100000),
  type: z.enum(['TERMINAL', 'DEPOT', 'STOP', 'RESTRICTED', 'MAINTENANCE']).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

export type CreateGeofenceDto = z.infer<typeof CreateGeofenceSchema>;
