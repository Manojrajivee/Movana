import { z } from 'zod';

export const AssignTripCrewSchema = z.object({
  driverId: z.string().uuid('Invalid driver ID format'),
  vehicleId: z.string().uuid('Invalid vehicle ID format'),
  assignmentType: z
    .enum(['PRIMARY_DRIVER', 'SECONDARY_DRIVER', 'RELIEF_DRIVER', 'CONDUCTOR'])
    .default('PRIMARY_DRIVER'),
});

export type AssignTripCrewDto = z.infer<typeof AssignTripCrewSchema>;
