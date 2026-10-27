import { z } from 'zod';

export const DetectTripDelaySchema = z.object({
  thresholdMinutes: z.coerce.number().int().min(1).max(180).optional(),
  reason: z.string().max(255).optional(),
  simulatedDelayMinutes: z.coerce.number().int().min(0).max(1440).optional(),
});

export type DetectTripDelayDto = z.infer<typeof DetectTripDelaySchema>;
