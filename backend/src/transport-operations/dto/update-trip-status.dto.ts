import { z } from 'zod';

export const UpdateTripStatusSchema = z.object({
  status: z.enum([
    'SCHEDULED',
    'BOARDING',
    'DEPARTED',
    'IN_TRANSIT',
    'DELAYED',
    'ARRIVED',
    'COMPLETED',
    'CANCELLED',
    'SUSPENDED',
  ]),
  reason: z.string().max(500).optional().nullable(),
  delayMinutes: z.coerce.number().int().min(0).optional(),
  currentStopId: z.string().uuid().optional().nullable(),
  currentLatitude: z.coerce.number().min(-90).max(90).optional().nullable(),
  currentLongitude: z.coerce.number().min(-180).max(180).optional().nullable(),
});

export type UpdateTripStatusDto = z.infer<typeof UpdateTripStatusSchema>;
