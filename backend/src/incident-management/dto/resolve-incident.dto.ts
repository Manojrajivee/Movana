import { z } from 'zod';

export const ResolveIncidentSchema = z.object({
  resolutionNotes: z
    .string()
    .min(5, { message: 'Resolution notes must be at least 5 characters' })
    .max(2000, { message: 'Resolution notes cannot exceed 2000 characters' }),
  correctiveAction: z
    .string()
    .min(5, { message: 'Corrective action must be at least 5 characters' })
    .max(2000, { message: 'Corrective action cannot exceed 2000 characters' })
    .optional(),
});

export type ResolveIncidentDto = z.infer<typeof ResolveIncidentSchema>;
