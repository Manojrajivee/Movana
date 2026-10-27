import { z } from 'zod';

export const ReorderRouteStopsSchema = z
  .object({
    stops: z
      .array(
        z.object({
          stopId: z.string().uuid('stopId must be a valid UUID'),
          sequenceNumber: z.number().int().min(1, 'sequenceNumber must be at least 1'),
        }),
      )
      .min(1, 'At least one stop must be provided for reordering'),
  })
  .refine(
    (data) => {
      const stopIds = new Set(data.stops.map((s) => s.stopId));
      return stopIds.size === data.stops.length;
    },
    {
      message: 'stopId entries in reorder array must be unique',
      path: ['stops'],
    },
  )
  .refine(
    (data) => {
      const sequences = new Set(data.stops.map((s) => s.sequenceNumber));
      return sequences.size === data.stops.length;
    },
    {
      message: 'sequenceNumber values in reorder array must be unique',
      path: ['stops'],
    },
  );

export type ReorderRouteStopsDto = z.infer<typeof ReorderRouteStopsSchema>;
