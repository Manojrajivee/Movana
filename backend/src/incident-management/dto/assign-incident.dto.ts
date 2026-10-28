import { z } from 'zod';

export const AssignIncidentSchema = z.object({
  assignedTo: z.string().uuid({ message: 'Valid investigator UUID is required' }),
  assignmentNotes: z
    .string()
    .max(1000, { message: 'Assignment notes cannot exceed 1000 characters' })
    .optional(),
});

export type AssignIncidentDto = z.infer<typeof AssignIncidentSchema>;
