import { z } from 'zod';

export const StartDutySchema = z.object({
  assignmentId: z.string().uuid('Invalid assignment ID format'),
});

export type StartDutyDto = z.infer<typeof StartDutySchema>;
