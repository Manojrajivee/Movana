import { z } from 'zod';

export const QueryLocationHistorySchema = z.object({
  startTime: z
    .string()
    .datetime()
    .optional()
    .transform((val) => (val ? new Date(val) : undefined)),
  endTime: z
    .string()
    .datetime()
    .optional()
    .transform((val) => (val ? new Date(val) : undefined)),
  tripId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

export type QueryLocationHistoryDto = z.infer<typeof QueryLocationHistorySchema>;
