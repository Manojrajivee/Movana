import { z } from 'zod';

export const UpdateMaintenanceStatusSchema = z.object({
  status: z.enum(['IN_PROGRESS', 'COMPLETED', 'CANCELLED'], {
    errorMap: () => ({ message: 'Status must be IN_PROGRESS, COMPLETED, or CANCELLED' }),
  }),
  notes: z.string().max(500).optional(),
});

export type UpdateMaintenanceStatusDto = z.infer<typeof UpdateMaintenanceStatusSchema>;
