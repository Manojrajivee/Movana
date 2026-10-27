import { z } from 'zod';

export const UpdateRouteSchema = z.object({
  name: z.string().min(2, 'name must be at least 2 characters').max(150).optional(),
  description: z.string().optional(),
  distanceKm: z.number().positive('distanceKm must be positive').optional(),
  estimatedDurationMinutes: z
    .number()
    .int()
    .positive('estimatedDurationMinutes must be a positive integer')
    .optional(),
});

export type UpdateRouteDto = z.infer<typeof UpdateRouteSchema>;
