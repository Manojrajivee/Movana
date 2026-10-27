import { z } from 'zod';

export const UpdateRouteStopSchema = z
  .object({
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
      if (data.arrivalOffsetMinutes !== undefined && data.departureOffsetMinutes !== undefined) {
        return data.departureOffsetMinutes >= data.arrivalOffsetMinutes;
      }
      return true;
    },
    {
      message: 'departureOffsetMinutes must be greater than or equal to arrivalOffsetMinutes',
      path: ['departureOffsetMinutes'],
    },
  );

export type UpdateRouteStopDto = z.infer<typeof UpdateRouteStopSchema>;
