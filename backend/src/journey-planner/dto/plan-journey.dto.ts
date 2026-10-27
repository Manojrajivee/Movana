import { z } from 'zod';

export const PlanJourneySchema = z
  .object({
    originStopId: z.string().uuid().optional(),
    destinationStopId: z.string().uuid().optional(),
    originLatitude: z.number().min(-90).max(90).optional(),
    originLongitude: z.number().min(-180).max(180).optional(),
    destinationLatitude: z.number().min(-90).max(90).optional(),
    destinationLongitude: z.number().min(-180).max(180).optional(),
    departureTime: z.string().datetime().optional(),
    maxTransfers: z.coerce.number().int().min(0).max(3).default(1),
    preferredMode: z.string().optional(),
    sortBy: z.enum(['DURATION', 'DEPARTURE_TIME', 'TRANSFERS']).default('DURATION'),
  })
  .refine(
    (data) =>
      (data.originStopId ||
        (data.originLatitude !== undefined && data.originLongitude !== undefined)) &&
      (data.destinationStopId ||
        (data.destinationLatitude !== undefined && data.destinationLongitude !== undefined)),
    {
      message:
        'Must specify either originStopId or origin coordinates (lat/lon), and either destinationStopId or destination coordinates (lat/lon)',
    },
  );

export type PlanJourneyDto = z.infer<typeof PlanJourneySchema>;
