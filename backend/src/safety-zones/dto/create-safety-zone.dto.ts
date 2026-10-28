import { z } from 'zod';

export const SafetyZoneRiskLevelEnum = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
export type SafetyZoneRiskLevel = z.infer<typeof SafetyZoneRiskLevelEnum>;

export const SafetyZoneCategoryEnum = z.enum([
  'SCHOOL_ZONE',
  'HOSPITAL_ZONE',
  'CONSTRUCTION_ZONE',
  'ACCIDENT_PRONE_AREA',
  'HAZARDOUS_TERRAIN',
  'RESTRICTED_PEDESTRIAN',
]);
export type SafetyZoneCategory = z.infer<typeof SafetyZoneCategoryEnum>;

export const CreateSafetyZoneSchema = z.object({
  geofenceId: z.string().uuid({ message: 'Valid geofenceId UUID is required' }),
  speedLimitKmh: z
    .number()
    .min(5, { message: 'Speed limit must be at least 5 km/h' })
    .max(120, { message: 'Speed limit cannot exceed 120 km/h' }),
  riskLevel: SafetyZoneRiskLevelEnum.default('MEDIUM'),
  zoneCategory: SafetyZoneCategoryEnum.default('ACCIDENT_PRONE_AREA'),
  cooldownMinutes: z.number().int().min(1).max(1440).default(15),
  autoReportIncident: z.boolean().default(false),
  activeTimeStart: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, {
      message: 'activeTimeStart must be in HH:mm 24-hour format',
    })
    .optional(),
  activeTimeEnd: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, {
      message: 'activeTimeEnd must be in HH:mm 24-hour format',
    })
    .optional(),
});

export type CreateSafetyZoneDto = z.infer<typeof CreateSafetyZoneSchema>;
