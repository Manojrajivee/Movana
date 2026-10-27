import { z } from 'zod';

export const CreateVehicleInspectionSchema = z.object({
  vehicleId: z.string().uuid('Invalid vehicle ID format'),
  inspectionType: z.enum(['PRE_TRIP', 'POST_TRIP', 'PERIODIC', 'SAFETY_AUDIT']).default('PRE_TRIP'),
  tripId: z.string().uuid().optional().nullable(),
  status: z.enum(['PASSED', 'FAILED', 'NEEDS_REPAIR']).default('PASSED'),
  odometer: z.number().min(0, 'Odometer cannot be negative'),
  notes: z.string().max(1000).optional().nullable(),
});

export type CreateVehicleInspectionDto = z.infer<typeof CreateVehicleInspectionSchema>;
