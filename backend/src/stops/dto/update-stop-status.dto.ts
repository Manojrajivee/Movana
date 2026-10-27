import { z } from 'zod';

export const UpdateStopStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE', 'TEMPORARILY_CLOSED']),
});

export type UpdateStopStatusDto = z.infer<typeof UpdateStopStatusSchema>;
