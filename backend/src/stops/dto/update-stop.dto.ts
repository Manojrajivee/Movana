import { z } from 'zod';

export const UpdateStopSchema = z.object({
  name: z.string().min(2, 'name must be at least 2 characters').max(150).optional(),
  description: z.string().optional(),
  address: z.string().min(2, 'address must be at least 2 characters').optional(),
  city: z.string().min(1).max(100).optional(),
  state: z.string().min(1).max(100).optional(),
  country: z.string().max(100).optional(),
  postalCode: z.string().max(20).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  geofenceRadiusMeters: z.number().int().min(10).optional(),
});

export type UpdateStopDto = z.infer<typeof UpdateStopSchema>;
