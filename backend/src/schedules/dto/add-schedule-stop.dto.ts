import { z } from 'zod';

export const AddScheduleStopSchema = z
  .object({
    stopId: z.string().uuid('stopId must be a valid UUID'),
    sequenceNumber: z.number().int().min(1, 'sequenceNumber must be at least 1'),
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
      const arr = data.scheduledArrivalOffsetMinutes ?? 0;
      const dep = data.scheduledDepartureOffsetMinutes ?? 0;
      return dep >= arr;
    },
    {
      message:
        'scheduledDepartureOffsetMinutes must be greater than or equal to scheduledArrivalOffsetMinutes',
      path: ['scheduledDepartureOffsetMinutes'],
    },
  );

export type AddScheduleStopDto = z.infer<typeof AddScheduleStopSchema>;
