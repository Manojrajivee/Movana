import { z } from 'zod';

export const IncidentSeverityEnum = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
export type IncidentSeverity = z.infer<typeof IncidentSeverityEnum>;

export const IncidentStatusEnum = z.enum([
  'OPEN',
  'INVESTIGATING',
  'ACTION_REQUIRED',
  'RESOLVED',
  'CLOSED',
]);
export type IncidentStatus = z.infer<typeof IncidentStatusEnum>;

export const WitnessStatementSchema = z.object({
  name: z.string().min(1, { message: 'Witness name is required' }).max(100),
  contact: z.string().max(100).optional(),
  statement: z.string().min(1, { message: 'Witness statement is required' }).max(2000),
});
export type WitnessStatement = z.infer<typeof WitnessStatementSchema>;

export const CreateIncidentSchema = z.object({
  tripId: z.string().uuid({ message: 'Valid tripId UUID is required' }).optional(),
  vehicleId: z.string().uuid({ message: 'Valid vehicleId UUID is required' }).optional(),
  driverId: z.string().uuid({ message: 'Valid driverId UUID is required' }).optional(),
  incidentTypeId: z.string().min(1, { message: 'incidentTypeId UUID or code is required' }),
  severity: IncidentSeverityEnum.default('MEDIUM'),
  title: z.string().min(3, { message: 'Title must be at least 3 characters' }).max(200),
  description: z
    .string()
    .min(10, { message: 'Description must be at least 10 characters' })
    .max(5000),
  latitude: z
    .number()
    .min(-90, { message: 'Latitude must be between -90 and 90' })
    .max(90, { message: 'Latitude must be between -90 and 90' })
    .optional(),
  longitude: z
    .number()
    .min(-180, { message: 'Longitude must be between -180 and 180' })
    .max(180, { message: 'Longitude must be between -180 and 180' })
    .optional(),
  occurredAt: z
    .string()
    .datetime({ message: 'occurredAt must be a valid ISO 8601 datetime' })
    .optional(),
  witnesses: z.array(WitnessStatementSchema).optional(),
});

export type CreateIncidentDto = z.input<typeof CreateIncidentSchema>;
