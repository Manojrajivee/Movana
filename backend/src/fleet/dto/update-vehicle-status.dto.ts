import { z } from 'zod';

export const UpdateVehicleStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'MAINTENANCE', 'DECOMMISSIONED', 'RESERVED']),
  reason: z.string().max(500, 'Reason must not exceed 500 characters').optional().nullable(),
});

export type UpdateVehicleStatusDto = z.infer<typeof UpdateVehicleStatusSchema>;
