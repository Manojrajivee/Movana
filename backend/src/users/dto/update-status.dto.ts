import { z } from 'zod';

export const UpdateStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED', 'DEACTIVATED'], {
    errorMap: () => ({ message: 'Status must be ACTIVE, SUSPENDED, or DEACTIVATED' }),
  }),
  reason: z.string().max(255).optional(),
});

export type UpdateStatusDto = z.infer<typeof UpdateStatusSchema>;
