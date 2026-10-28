import { z } from 'zod';

export const IncidentActionStatusEnum = z.enum(['COMPLETED', 'PENDING', 'IN_PROGRESS']);
export type IncidentActionStatus = z.infer<typeof IncidentActionStatusEnum>;

export const CreateIncidentActionSchema = z.object({
  actionTaken: z
    .string()
    .min(5, { message: 'Action taken description must be at least 5 characters' })
    .max(2000, { message: 'Action taken cannot exceed 2000 characters' }),
  status: IncidentActionStatusEnum.default('COMPLETED'),
});

export type CreateIncidentActionDto = z.infer<typeof CreateIncidentActionSchema>;
