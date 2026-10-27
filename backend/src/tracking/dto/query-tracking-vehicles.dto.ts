import { z } from 'zod';

export const QueryTrackingVehiclesSchema = z.object({
  vehicleStatus: z.string().optional(),
  vehicleType: z.string().optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

export type QueryTrackingVehiclesDto = z.infer<typeof QueryTrackingVehiclesSchema>;
