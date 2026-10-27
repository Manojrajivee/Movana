import { z } from 'zod';

export const AddRouteStopSchema = z
  .object({
    stopId: z.string().uuid('stopId must be a valid UUID'),
    sequenceNumber: z.number().int().min(1, 'sequenceNumber must be at least 1'),
    arrivalOffsetMinutes: z
      .number()
      .int()
      .min(0, 'arrivalOffsetMinutes cannot be negative')
      .optional(),
    departureOffsetMinutes: z
      .number()
      .int()
      .min(0, 'departureOffsetMinutes cannot be negative')
      .optional(),
    distanceFromOriginKm: z.number().min(0, 'distanceFromOriginKm cannot be negative').optional(),
    isBoardingAllowed: z.boolean().optional(),
    isDropoffAllowed: z.boolean().optional(),
  })
  .refine(
    (data) => {
      const arr = data.arrivalOffsetMinutes ?? 0;
      const dep = data.departureOffsetMinutes ?? 0;
      return dep >= arr;
    },
    {
      message: 'departureOffsetMinutes must be greater than or equal to arrivalOffsetMinutes',
      path: ['departureOffsetMinutes'],
    },
  );

export type AddRouteStopDto = z.infer<typeof AddRouteStopSchema>;
