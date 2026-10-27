import { z } from 'zod';

export const RecordTripEventSchema = z.object({
  eventType: z.string().min(1, 'Event type is required').max(64),
  eventData: z.record(z.any()).optional().default({}),
  vehicleId: z.string().uuid().optional().nullable(),
  driverId: z.string().uuid().optional().nullable(),
  occurredAt: z.string().datetime({ offset: true }).optional(),
});

export type RecordTripEventDto = z.infer<typeof RecordTripEventSchema>;
