import { z } from 'zod';

export const QueryMaintenanceSchedulesSchema = z.object({
  vehicleId: z.string().uuid().optional(),
  vehicleTypeId: z.string().uuid().optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((val) => val === 'true')
    .optional(),
});

export type QueryMaintenanceSchedulesDto = z.infer<typeof QueryMaintenanceSchedulesSchema>;

export const QueryMaintenanceRecordsSchema = z.object({
  vehicleId: z.string().uuid().optional(),
  status: z.enum(['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type QueryMaintenanceRecordsDto = z.infer<typeof QueryMaintenanceRecordsSchema>;

export const QueryVehicleInspectionsSchema = z.object({
  vehicleId: z.string().uuid().optional(),
  inspectionType: z.enum(['PRE_TRIP', 'POST_TRIP', 'PERIODIC', 'SAFETY_AUDIT']).optional(),
  status: z.enum(['PASSED', 'FAILED', 'NEEDS_REPAIR']).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type QueryVehicleInspectionsDto = z.infer<typeof QueryVehicleInspectionsSchema>;
