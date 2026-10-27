import { z } from 'zod';

export const QueryDisruptionsSchema = z.object({
  routeId: z.string().uuid().optional(),
  tripId: z.string().uuid().optional(),
  severity: z.enum(['INFO', 'WARNING', 'CRITICAL']).optional(),
  disruptionType: z
    .enum([
      'ROAD_CLOSURE',
      'ROUTE_DETOUR',
      'WEATHER_ALERT',
      'MAINTENANCE_WORK',
      'ACCIDENT_BLOCK',
      'SPECIAL_EVENT',
      'SUSPENSION',
    ])
    .optional(),
  status: z.enum(['ACTIVE', 'RESOLVED', 'ALL']).default('ACTIVE'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type QueryDisruptionsDto = z.infer<typeof QueryDisruptionsSchema>;
