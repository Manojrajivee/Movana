import { z } from 'zod';

export const CreateAdHocTripSchema = z.object({
  routeId: z.string().uuid('routeId must be a valid UUID'),
  scheduledDepartureAt: z
    .string()
    .datetime({ message: 'scheduledDepartureAt must be a valid ISO 8601 timestamp' }),
  scheduledArrivalAt: z
    .string()
    .datetime({ message: 'scheduledArrivalAt must be a valid ISO 8601 timestamp' }),
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

export type CreateAdHocTripDto = z.infer<typeof CreateAdHocTripSchema>;
