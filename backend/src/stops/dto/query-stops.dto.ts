import { z } from 'zod';

export const QueryStopsSchema = z.object({
  city: z.string().optional(),
  state: z.string().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'TEMPORARILY_CLOSED']).optional(),
  search: z.string().optional(),
  limit: z
    .preprocess((val) => (val !== undefined ? Number(val) : 20), z.number().int().min(1).max(100))
    .default(20),
  offset: z
    .preprocess((val) => (val !== undefined ? Number(val) : 0), z.number().int().min(0))
    .default(0),
});

export type QueryStopsDto = z.infer<typeof QueryStopsSchema>;
