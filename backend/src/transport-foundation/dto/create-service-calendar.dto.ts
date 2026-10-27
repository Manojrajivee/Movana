import { z } from 'zod';

export const CreateServiceCalendarSchema = z
  .object({
    calendarName: z.string().min(2, 'Calendar name must be at least 2 characters').max(100),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'startDate must be formatted as YYYY-MM-DD'),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'endDate must be formatted as YYYY-MM-DD'),
    monday: z.boolean().default(true),
    tuesday: z.boolean().default(true),
    wednesday: z.boolean().default(true),
    thursday: z.boolean().default(true),
    friday: z.boolean().default(true),
    saturday: z.boolean().default(true),
    sunday: z.boolean().default(true),
  })
  .refine((data) => new Date(data.endDate) >= new Date(data.startDate), {
    message: 'endDate must be greater than or equal to startDate',
    path: ['endDate'],
  });

export type CreateServiceCalendarDto = z.infer<typeof CreateServiceCalendarSchema>;
