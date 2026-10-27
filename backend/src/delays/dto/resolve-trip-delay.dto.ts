import { z } from 'zod';

export const ResolveTripDelaySchema = z.object({
  resolutionNotes: z.string().min(3).max(500),
  newStatus: z.enum(['IN_TRANSIT', 'BOARDING', 'SCHEDULED', 'ARRIVED', 'COMPLETED']).optional(),
  delayMinutes: z.coerce.number().int().min(0).max(1440).optional(),
});

export type ResolveTripDelayDto = z.infer<typeof ResolveTripDelaySchema>;
