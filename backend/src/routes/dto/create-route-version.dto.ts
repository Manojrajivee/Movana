import { z } from 'zod';

export const CreateRouteVersionSchema = z.object({
  effectiveFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'effectiveFrom must be formatted as YYYY-MM-DD')
    .optional(),
  effectiveTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'effectiveTo must be formatted as YYYY-MM-DD')
    .optional(),
  changeNotes: z.string().optional(),
});

export type CreateRouteVersionDto = z.infer<typeof CreateRouteVersionSchema>;
