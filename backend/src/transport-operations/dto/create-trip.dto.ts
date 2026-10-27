import { z } from 'zod';

export const CreateTripSchema = z
  .object({
    tripNumber: z.string().min(1, 'Trip number is required').max(64),
    routeId: z.string().uuid('Invalid route ID format'),
    scheduleId: z.string().uuid('Invalid schedule ID format').optional().nullable(),
    vehicleId: z.string().uuid('Invalid vehicle ID format').optional().nullable(),
    primaryDriverId: z.string().uuid('Invalid primary driver ID format').optional().nullable(),
    secondaryDriverId: z.string().uuid('Invalid secondary driver ID format').optional().nullable(),
    scheduledDepartureAt: z.string().datetime({
      offset: true,
      message: 'scheduledDepartureAt must be a valid ISO 8601 timestamp with timezone',
    }),
    scheduledArrivalAt: z.string().datetime({
      offset: true,
      message: 'scheduledArrivalAt must be a valid ISO 8601 timestamp with timezone',
    }),
  })
  .refine((data) => new Date(data.scheduledArrivalAt) > new Date(data.scheduledDepartureAt), {
    message: 'Scheduled arrival time must be after scheduled departure time',
    path: ['scheduledArrivalAt'],
  });

export type CreateTripDto = z.infer<typeof CreateTripSchema>;
