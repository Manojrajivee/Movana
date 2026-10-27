import { z } from 'zod';

export const QueryRecentArrivalsSchema = z.object({
  hours: z.coerce.number().min(0.5).max(48).default(4),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type QueryRecentArrivalsDto = z.infer<typeof QueryRecentArrivalsSchema>;
