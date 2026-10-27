import { z } from 'zod';

export const CreateDisruptionSchema = z.object({
  title: z
    .string()
    .min(3, 'title must be at least 3 characters')
    .max(200, 'title must not exceed 200 characters'),
  description: z
    .string()
    .min(5, 'description must be at least 5 characters')
    .max(2000, 'description must not exceed 2000 characters'),
  disruptionType: z.enum(
    [
      'ROAD_CLOSURE',
      'ROUTE_DETOUR',
      'WEATHER_ALERT',
      'MAINTENANCE_WORK',
      'ACCIDENT_BLOCK',
      'SPECIAL_EVENT',
      'SUSPENSION',
    ],
    {
      errorMap: () => ({
        message:
          'disruptionType must be one of: ROAD_CLOSURE, ROUTE_DETOUR, WEATHER_ALERT, MAINTENANCE_WORK, ACCIDENT_BLOCK, SPECIAL_EVENT, SUSPENSION',
      }),
    },
  ),
  severity: z.enum(['INFO', 'WARNING', 'CRITICAL']).optional(),
  routeId: z.string().uuid('routeId must be a valid UUID').optional(),
  tripId: z.string().uuid('tripId must be a valid UUID').optional(),
  affectedStops: z.array(z.string().uuid()).optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
});

export type CreateDisruptionDto = z.infer<typeof CreateDisruptionSchema>;
