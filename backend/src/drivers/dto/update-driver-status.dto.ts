import { z } from 'zod';

export const UpdateDriverStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'TERMINATED'], {
    errorMap: () => ({
      message: 'Status must be ACTIVE, ON_LEAVE, SUSPENDED, or TERMINATED',
    }),
  }),
  reason: z.string().max(500, 'Reason cannot exceed 500 characters').optional(),
});

export type UpdateDriverStatusDto = z.infer<typeof UpdateDriverStatusSchema>;
