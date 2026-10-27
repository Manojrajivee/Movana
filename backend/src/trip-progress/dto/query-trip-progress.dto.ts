import { z } from 'zod';

export const QueryMilestonesSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  eventType: z.string().optional(),
});

export type QueryMilestonesDto = z.infer<typeof QueryMilestonesSchema>;
