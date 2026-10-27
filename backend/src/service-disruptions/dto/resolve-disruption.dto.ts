import { z } from 'zod';

export const ResolveDisruptionSchema = z.object({
  resolutionNotes: z.string().max(1000).optional(),
});

export type ResolveDisruptionDto = z.infer<typeof ResolveDisruptionSchema>;
