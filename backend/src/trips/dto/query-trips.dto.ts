import { z } from 'zod';

export const QueryTripsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  routeId: z.string().uuid().optional(),
  scheduleId: z.string().uuid().optional(),
  vehicleId: z.string().uuid().optional(),
  driverId: z.string().uuid().optional(),
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
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be formatted as YYYY-MM-DD')
    .optional(),
  search: z.string().max(100).optional(),
});

export type QueryTripsDto = z.infer<typeof QueryTripsSchema>;
