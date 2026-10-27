import { z } from 'zod';

export const EndDutySchema = z.object({
  assignmentId: z.string().uuid('Invalid assignment ID format'),
  notes: z.string().max(500, 'Notes must not exceed 500 characters').optional(),
});

export type EndDutyDto = z.infer<typeof EndDutySchema>;
