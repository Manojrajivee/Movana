import { z } from 'zod';

export const CreateCalendarExceptionSchema = z.object({
  exceptionDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'exceptionDate must be formatted as YYYY-MM-DD'),
  exceptionType: z.enum(['ADDED', 'REMOVED']).default('REMOVED'),
  description: z.string().max(255).optional().nullable(),
});

export type CreateCalendarExceptionDto = z.infer<typeof CreateCalendarExceptionSchema>;
