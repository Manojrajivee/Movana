import { z } from 'zod';

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)(:([0-5]\d))?$/;

export const CreateDriverAvailabilitySchema = z
  .object({
    dayOfWeek: z
      .number()
      .int()
      .min(0, 'Day of week must be between 0 (Sunday) and 6 (Saturday)')
      .max(6, 'Day of week must be between 0 (Sunday) and 6 (Saturday)'),
    startTime: z.string().regex(timeRegex, 'startTime must be formatted as HH:MM or HH:MM:SS'),
    endTime: z.string().regex(timeRegex, 'endTime must be formatted as HH:MM or HH:MM:SS'),
    isAvailable: z.boolean().default(true),
    effectiveDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'effectiveDate must be in YYYY-MM-DD format')
      .optional(),
  })
  .refine(
    (data) => {
      return data.endTime > data.startTime;
    },
    {
      message: 'endTime must be later than startTime',
      path: ['endTime'],
    },
  );

export type CreateDriverAvailabilityDto = z.infer<typeof CreateDriverAvailabilitySchema>;
