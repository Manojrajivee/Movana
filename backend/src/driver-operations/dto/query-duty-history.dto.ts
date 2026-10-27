import { z } from 'zod';

export const QueryDutyHistorySchema = z.object({
  driverId: z.string().uuid().optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type QueryDutyHistoryDto = z.infer<typeof QueryDutyHistorySchema>;
