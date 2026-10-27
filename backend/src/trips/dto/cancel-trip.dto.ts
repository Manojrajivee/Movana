import { z } from 'zod';

export const CancelTripSchema = z.object({
  reason: z
    .string()
    .min(3, 'Cancellation reason must be at least 3 characters')
    .max(500, 'Cancellation reason must not exceed 500 characters'),
});

export type CancelTripDto = z.infer<typeof CancelTripSchema>;
