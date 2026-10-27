import { z } from 'zod';

export const RecordArrivalSchema = z.object({
  arrivedAt: z.string().datetime().optional(),
  notes: z.string().max(255).optional(),
});

export type RecordArrivalDto = z.infer<typeof RecordArrivalSchema>;
