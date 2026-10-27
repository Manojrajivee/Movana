import { z } from 'zod';

export const QueryRouteAnalyticsSchema = z.object({
  timeframeDays: z.coerce.number().int().min(1).max(90).default(30),
});

export type QueryRouteAnalyticsDto = z.infer<typeof QueryRouteAnalyticsSchema>;
