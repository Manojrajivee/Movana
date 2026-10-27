import { z } from 'zod';

export const QueryDirectJourneySchema = z.object({
  originStopId: z.string().uuid(),
  destinationStopId: z.string().uuid(),
  departureDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be in YYYY-MM-DD format')
    .optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type QueryDirectJourneyDto = z.infer<typeof QueryDirectJourneySchema>;
