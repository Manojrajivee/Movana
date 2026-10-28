import { z } from 'zod';

export const CloseIncidentSchema = z.object({
  notes: z
    .string()
    .min(5, { message: 'Closing notes must be at least 5 characters' })
    .max(2000, { message: 'Closing notes cannot exceed 2000 characters' })
    .optional(),
});

export type CloseIncidentDto = z.infer<typeof CloseIncidentSchema>;
