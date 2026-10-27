import { z } from 'zod';

export const UpdateTripSchema = z.object({
  vehicleId: z.string().uuid().nullable().optional(),
  primaryDriverId: z.string().uuid().nullable().optional(),
  secondaryDriverId: z.string().uuid().nullable().optional(),
  scheduledDepartureAt: z.string().datetime().optional(),
  scheduledArrivalAt: z.string().datetime().optional(),
});

export type UpdateTripDto = z.infer<typeof UpdateTripSchema>;
