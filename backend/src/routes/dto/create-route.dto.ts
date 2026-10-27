import { z } from 'zod';

export const CreateRouteSchema = z
  .object({
    routeCode: z
      .string()
      .min(2, 'routeCode must be at least 2 characters')
      .max(50, 'routeCode must not exceed 50 characters')
      .regex(/^[A-Za-z0-9_-]+$/, 'routeCode must be alphanumeric with dashes or underscores'),
    name: z.string().min(2, 'name must be at least 2 characters').max(150),
    description: z.string().optional(),
    originStopId: z.string().uuid('originStopId must be a valid UUID'),
    destinationStopId: z.string().uuid('destinationStopId must be a valid UUID'),
    distanceKm: z.number().positive('distanceKm must be positive'),
    estimatedDurationMinutes: z
      .number()
      .int()
      .positive('estimatedDurationMinutes must be a positive integer'),
    status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']).optional(),
  })
  .refine((data) => data.originStopId !== data.destinationStopId, {
    message: 'originStopId and destinationStopId must be different stops',
    path: ['destinationStopId'],
  });

export type CreateRouteDto = z.infer<typeof CreateRouteSchema>;
