import { z } from 'zod';

export const UpdateScheduleStopSchema = z
  .object({
    scheduledArrivalOffsetMinutes: z
      .number()
      .int()
      .min(0, 'scheduledArrivalOffsetMinutes cannot be negative')
      .optional(),
    scheduledDepartureOffsetMinutes: z
      .number()
      .int()
      .min(0, 'scheduledDepartureOffsetMinutes cannot be negative')
      .optional(),
  })
  .refine(
    (data) => {
      if (
        data.scheduledArrivalOffsetMinutes !== undefined &&
        data.scheduledDepartureOffsetMinutes !== undefined
      ) {
        return data.scheduledDepartureOffsetMinutes >= data.scheduledArrivalOffsetMinutes;
      }
      return true;
    },
    {
      message:
        'scheduledDepartureOffsetMinutes must be greater than or equal to scheduledArrivalOffsetMinutes',
      path: ['scheduledDepartureOffsetMinutes'],
    },
  );

export type UpdateScheduleStopDto = z.infer<typeof UpdateScheduleStopSchema>;
