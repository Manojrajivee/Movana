import { z } from 'zod';

export const SkipStopSchema = z.object({
  reason: z
    .string()
    .min(3, 'reason must be at least 3 characters')
    .max(500, 'reason must not exceed 500 characters'),
});

export type SkipStopDto = z.infer<typeof SkipStopSchema>;
