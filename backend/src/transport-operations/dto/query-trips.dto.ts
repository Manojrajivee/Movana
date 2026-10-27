import { z } from 'zod';

export const QueryTripsSchema = z.object({
  status: z
    .enum([
      'SCHEDULED',
      'BOARDING',
      'DEPARTED',
      'IN_TRANSIT',
      'DELAYED',
      'ARRIVED',
      'COMPLETED',
      'CANCELLED',
      'SUSPENDED',
    ])
    .optional(),
  routeId: z.string().uuid().optional(),
  vehicleId: z.string().uuid().optional(),
  driverId: z.string().uuid().optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be formatted as YYYY-MM-DD')
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type QueryTripsDto = z.infer<typeof QueryTripsSchema>;
