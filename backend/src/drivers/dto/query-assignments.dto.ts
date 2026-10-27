import { z } from 'zod';

export const QueryAssignmentsSchema = z.object({
  driverId: z.string().uuid().optional(),
  vehicleId: z.string().uuid().optional(),
  status: z.enum(['SCHEDULED', 'ACTIVE', 'COMPLETED', 'CANCELLED']).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type QueryAssignmentsDto = z.infer<typeof QueryAssignmentsSchema>;
