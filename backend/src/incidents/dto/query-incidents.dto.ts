import { z } from 'zod';
import { IncidentSeverityEnum, IncidentStatusEnum } from './create-incident.dto';

export const QueryIncidentsSchema = z.object({
  status: IncidentStatusEnum.optional(),
  severity: IncidentSeverityEnum.optional(),
  tripId: z.string().uuid().optional(),
  vehicleId: z.string().uuid().optional(),
  driverId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type QueryIncidentsDto = z.input<typeof QueryIncidentsSchema>;
