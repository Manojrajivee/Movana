import { z } from 'zod';

export const IncidentLifecycleStatusEnum = z.enum([
  'OPEN',
  'INVESTIGATING',
  'ACTION_REQUIRED',
  'RESOLVED',
  'CLOSED',
]);
export type IncidentLifecycleStatus = z.infer<typeof IncidentLifecycleStatusEnum>;

export const TransitionIncidentStatusSchema = z.object({
  status: IncidentLifecycleStatusEnum,
  notes: z
    .string()
    .min(5, { message: 'Transition notes must be at least 5 characters' })
    .max(2000, { message: 'Transition notes cannot exceed 2000 characters' })
    .optional(),
});

export type TransitionIncidentStatusDto = z.infer<typeof TransitionIncidentStatusSchema>;
