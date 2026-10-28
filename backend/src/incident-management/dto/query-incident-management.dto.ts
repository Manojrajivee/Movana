import { z } from 'zod';
import { IncidentLifecycleStatusEnum } from './transition-status.dto';

export const IncidentSeverityEnum = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
export type IncidentSeverity = z.infer<typeof IncidentSeverityEnum>;

export const QueryIncidentManagementSchema = z.object({
  status: IncidentLifecycleStatusEnum.optional(),
  severity: IncidentSeverityEnum.optional(),
  assignedTo: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type QueryIncidentManagementDto = z.input<typeof QueryIncidentManagementSchema>;
