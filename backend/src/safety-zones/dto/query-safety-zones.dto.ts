import { z } from 'zod';
import { SafetyZoneCategoryEnum, SafetyZoneRiskLevelEnum } from './create-safety-zone.dto';

export const QuerySafetyZonesSchema = z.object({
  riskLevel: SafetyZoneRiskLevelEnum.optional(),
  zoneCategory: SafetyZoneCategoryEnum.optional(),
  activeOnly: z.preprocess((val) => val === 'true' || val === true, z.boolean()).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type QuerySafetyZonesDto = z.infer<typeof QuerySafetyZonesSchema>;
