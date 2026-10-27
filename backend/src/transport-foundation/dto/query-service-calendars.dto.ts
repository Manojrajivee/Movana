import { z } from 'zod';

export const QueryServiceCalendarsSchema = z.object({
  search: z.string().optional(),
  activeOnDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'activeOnDate must be formatted as YYYY-MM-DD')
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type QueryServiceCalendarsDto = z.infer<typeof QueryServiceCalendarsSchema>;
