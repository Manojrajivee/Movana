import { z } from 'zod';

export const CreateMaintenanceScheduleSchema = z.object({
  serviceName: z.string().min(2).max(100).trim(),
  vehicleTypeId: z.string().uuid().optional().nullable(),
  vehicleId: z.string().uuid().optional().nullable(),
  intervalKm: z.number().int().min(100).default(10000),
  intervalDays: z.number().int().min(1).default(90),
  description: z.string().max(500).optional().nullable(),
  isActive: z.boolean().default(true),
});

export type CreateMaintenanceScheduleDto = z.infer<typeof CreateMaintenanceScheduleSchema>;
