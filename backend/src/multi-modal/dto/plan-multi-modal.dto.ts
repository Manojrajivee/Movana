import { z } from 'zod';

export const PlanMultiModalSchema = z.object({
  originStopId: z.string().uuid(),
  destinationStopId: z.string().uuid(),
  allowedModes: z
    .array(
      z.enum([
        'BUS_RAPID_TRANSIT',
        'CITY_BUS',
        'EXPRESS_COACH',
        'METRO_FEEDER',
        'WALKING_CONNECTION',
      ]),
    )
    .optional(),
  maxWalkingMeters: z.coerce.number().int().min(100).max(3000).default(800),
  preferDirect: z.boolean().default(false),
});

export type PlanMultiModalDto = z.infer<typeof PlanMultiModalSchema>;
