import { z } from 'zod';

export const UpdateGeofenceSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  description: z.string().max(500).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  radiusMeters: z.number().int().positive().max(100000).optional(),
  type: z.enum(['TERMINAL', 'DEPOT', 'STOP', 'RESTRICTED', 'MAINTENANCE']).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

export type UpdateGeofenceDto = z.infer<typeof UpdateGeofenceSchema>;
