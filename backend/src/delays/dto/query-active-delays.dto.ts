import { z } from 'zod';

export const QueryActiveDelaysSchema = z.object({
  minDelayMinutes: z.coerce.number().int().min(1).optional(),
  routeId: z.string().uuid().optional(),
  vehicleId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export type QueryActiveDelaysDto = z.infer<typeof QueryActiveDelaysSchema>;
