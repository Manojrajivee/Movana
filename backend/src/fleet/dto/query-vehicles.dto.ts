import { z } from 'zod';

export const QueryVehiclesSchema = z.object({
  status: z.enum(['ACTIVE', 'MAINTENANCE', 'DECOMMISSIONED', 'RESERVED']).optional(),
  vehicleTypeId: z.string().uuid().optional(),
  manufacturerId: z.string().uuid().optional(),
  modelId: z.string().uuid().optional(),
  fuelType: z.enum(['DIESEL', 'ELECTRIC', 'CNG', 'HYBRID']).optional(),
  search: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type QueryVehiclesDto = z.infer<typeof QueryVehiclesSchema>;
