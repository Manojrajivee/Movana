import { z } from 'zod';

export const RecordDepartureSchema = z.object({
  departedAt: z.string().datetime().optional(),
  notes: z.string().max(255).optional(),
});

export type RecordDepartureDto = z.infer<typeof RecordDepartureSchema>;
