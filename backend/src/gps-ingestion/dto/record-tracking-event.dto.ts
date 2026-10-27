import { z } from 'zod';

export const RecordTrackingEventSchema = z.object({
  deviceImei: z.string().min(5).max(32),
  vehicleId: z.string().uuid().optional(),
  eventType: z.string().min(2).max(64),
  payload: z.record(z.any()).optional(),
  recordedAt: z
    .string()
    .datetime()
    .or(z.date())
    .transform((val) => new Date(val)),
});

export type RecordTrackingEventDto = z.infer<typeof RecordTrackingEventSchema>;
