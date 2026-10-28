import { z } from 'zod';
import { SafetyZoneCategoryEnum, SafetyZoneRiskLevelEnum } from './create-safety-zone.dto';

export const UpdateSafetyZoneSchema = z.object({
  speedLimitKmh: z
    .number()
    .min(5, { message: 'Speed limit must be at least 5 km/h' })
    .max(120, { message: 'Speed limit cannot exceed 120 km/h' })
    .optional(),
  riskLevel: SafetyZoneRiskLevelEnum.optional(),
  zoneCategory: SafetyZoneCategoryEnum.optional(),
  cooldownMinutes: z.number().int().min(1).max(1440).optional(),
  autoReportIncident: z.boolean().optional(),
  active: z.boolean().optional(),
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

export type UpdateSafetyZoneDto = z.infer<typeof UpdateSafetyZoneSchema>;
