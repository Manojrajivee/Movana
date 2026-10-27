import { z } from 'zod';

export const UpdateVehicleAssignmentStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'COMPLETED', 'CANCELLED'], {
    errorMap: () => ({ message: 'Status must be ACTIVE, COMPLETED, or CANCELLED' }),
  }),
});

export type UpdateVehicleAssignmentStatusDto = z.infer<typeof UpdateVehicleAssignmentStatusSchema>;
