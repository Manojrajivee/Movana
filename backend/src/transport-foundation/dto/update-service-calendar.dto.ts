import { z } from 'zod';

export const UpdateServiceCalendarSchema = z
  .object({
    calendarName: z.string().min(2).max(100).optional(),
    startDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'startDate must be formatted as YYYY-MM-DD')
      .optional(),
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'endDate must be formatted as YYYY-MM-DD')
      .optional(),
    monday: z.boolean().optional(),
    tuesday: z.boolean().optional(),
    wednesday: z.boolean().optional(),
    thursday: z.boolean().optional(),
    friday: z.boolean().optional(),
    saturday: z.boolean().optional(),
    sunday: z.boolean().optional(),
  })
  .refine(
    (data) => {
      if (data.startDate && data.endDate) {
        return new Date(data.endDate) >= new Date(data.startDate);
      }
      return true;
    },
    {
      message: 'endDate must be greater than or equal to startDate',
      path: ['endDate'],
    },
  );

export type UpdateServiceCalendarDto = z.infer<typeof UpdateServiceCalendarSchema>;
