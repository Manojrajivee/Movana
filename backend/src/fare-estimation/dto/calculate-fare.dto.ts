import { z } from 'zod';

export const CalculateFareSchema = z.object({
  routeId: z.string().uuid().optional(),
  tripId: z.string().uuid().optional(),
  originStopId: z.string().uuid().optional(),
  destinationStopId: z.string().uuid().optional(),
  distanceKm: z.coerce.number().positive().optional(),
  vehicleTypeId: z.string().uuid().optional(),
  seatType: z.enum(['REGULAR', 'SLEEPER', 'AC', 'EXECUTIVE']).default('REGULAR'),
  passengerCategory: z.enum(['ADULT', 'CHILD', 'SENIOR', 'STUDENT']).default('ADULT'),
  couponCode: z.string().trim().toUpperCase().optional(),
});

export type CalculateFareDto = z.infer<typeof CalculateFareSchema>;
