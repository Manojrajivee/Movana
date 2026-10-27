import { z } from 'zod';

export const UpdateDisruptionSchema = z.object({
  title: z.string().min(3).max(200).optional(),
  description: z.string().min(5).max(2000).optional(),
  severity: z.enum(['INFO', 'WARNING', 'CRITICAL']).optional(),
  endsAt: z.string().datetime().nullable().optional(),
});

export type UpdateDisruptionDto = z.infer<typeof UpdateDisruptionSchema>;
