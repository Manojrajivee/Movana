import { z } from 'zod';

export const QueryTripSchedulesSchema = z.object({
  routeId: z.string().uuid().optional(),
  serviceCalendarId: z.string().uuid().optional(),
  isActive: z
    .preprocess((val) => {
      if (typeof val === 'string') {
        if (val.toLowerCase() === 'true') return true;
        if (val.toLowerCase() === 'false') return false;
      }
      return val;
    }, z.boolean())
    .optional(),
  search: z.string().optional(),
  limit: z
    .preprocess((val) => (val !== undefined ? Number(val) : 20), z.number().int().min(1).max(100))
    .default(20),
  offset: z
    .preprocess((val) => (val !== undefined ? Number(val) : 0), z.number().int().min(0))
    .default(0),
});

export type QueryTripSchedulesDto = z.infer<typeof QueryTripSchedulesSchema>;
