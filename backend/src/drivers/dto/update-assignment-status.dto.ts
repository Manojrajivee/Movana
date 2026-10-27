import { z } from 'zod';

export const UpdateAssignmentStatusSchema = z.object({
  status: z.enum(['SCHEDULED', 'ACTIVE', 'COMPLETED', 'CANCELLED']),
  reason: z.string().max(500, 'Reason must not exceed 500 characters').optional().nullable(),
});

export type UpdateAssignmentStatusDto = z.infer<typeof UpdateAssignmentStatusSchema>;
