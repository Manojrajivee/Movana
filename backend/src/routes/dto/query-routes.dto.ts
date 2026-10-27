import { z } from 'zod';

export const QueryRoutesSchema = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']).optional(),
  originStopId: z.string().uuid().optional(),
  destinationStopId: z.string().uuid().optional(),
  search: z.string().optional(),
  limit: z
    .preprocess((val) => (val !== undefined ? Number(val) : 20), z.number().int().min(1).max(100))
    .default(20),
  offset: z
    .preprocess((val) => (val !== undefined ? Number(val) : 0), z.number().int().min(0))
    .default(0),
});

export type QueryRoutesDto = z.infer<typeof QueryRoutesSchema>;
