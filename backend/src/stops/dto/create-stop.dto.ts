import { z } from 'zod';

export const CreateStopSchema = z.object({
  stopCode: z
    .string()
    .min(2, 'stopCode must be at least 2 characters')
    .max(32, 'stopCode must not exceed 32 characters')
    .regex(/^[A-Za-z0-9_-]+$/, 'stopCode must be alphanumeric with dashes or underscores'),
  name: z.string().min(2, 'name must be at least 2 characters').max(150),
  description: z.string().optional(),
  address: z.string().min(2, 'address must be at least 2 characters'),
  city: z.string().min(1, 'city is required').max(100),
  state: z.string().min(1, 'state is required').max(100),
  country: z.string().max(100).optional(),
  postalCode: z.string().max(20).optional(),
  latitude: z.number().min(-90).max(90, 'latitude must be between -90 and 90'),
  longitude: z.number().min(-180).max(180, 'longitude must be between -180 and 180'),
  geofenceRadiusMeters: z
    .number()
    .int()
    .min(10, 'geofenceRadiusMeters must be at least 10')
    .optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'TEMPORARILY_CLOSED']).optional(),
});

export type CreateStopDto = z.infer<typeof CreateStopSchema>;
