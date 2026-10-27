import { z } from 'zod';

export const QueryGeofencesSchema = z.object({
  type: z.enum(['TERMINAL', 'DEPOT', 'STOP', 'RESTRICTED', 'MAINTENANCE']).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

export type QueryGeofencesDto = z.infer<typeof QueryGeofencesSchema>;
