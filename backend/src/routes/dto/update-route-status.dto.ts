import { z } from 'zod';

export const UpdateRouteStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']),
});

export type UpdateRouteStatusDto = z.infer<typeof UpdateRouteStatusSchema>;
