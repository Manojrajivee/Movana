import { z } from 'zod';

export const DispatchScheduleSchema = z.object({
  scheduleId: z.string().uuid('scheduleId must be a valid UUID'),
  serviceDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'serviceDate must be formatted as YYYY-MM-DD'),
  tripNumber: z
    .string()
    .min(2, 'tripNumber must be at least 2 characters')
    .max(64, 'tripNumber must not exceed 64 characters')
    .regex(/^[A-Za-z0-9_-]+$/, 'tripNumber must be alphanumeric with dashes or underscores')
    .optional(),
  vehicleId: z.string().uuid('vehicleId must be a valid UUID').optional(),
  primaryDriverId: z.string().uuid('primaryDriverId must be a valid UUID').optional(),
  secondaryDriverId: z.string().uuid('secondaryDriverId must be a valid UUID').optional(),
});

export type DispatchScheduleDto = z.infer<typeof DispatchScheduleSchema>;
