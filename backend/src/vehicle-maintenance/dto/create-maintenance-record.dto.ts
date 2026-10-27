import { z } from 'zod';

export const CreateMaintenanceRecordSchema = z.object({
  vehicleId: z.string().uuid('Invalid vehicle ID format'),
  maintenanceType: z
    .enum(['SCHEDULED', 'UNSCHEDULED', 'EMERGENCY', 'INSPECTION_REPAIR'])
    .default('SCHEDULED'),
  scheduledDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'scheduledDate must be in YYYY-MM-DD format'),
  odometer: z.number().min(0, 'Odometer cannot be negative'),
  cost: z.number().min(0, 'Cost cannot be negative').default(0.0),
  currency: z.string().length(3).default('INR'),
  vendor: z.string().min(2).max(150).trim(),
  description: z.string().min(3).max(1000).trim(),
  technician: z.string().min(2).max(100).trim(),
  nextDueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'nextDueDate must be in YYYY-MM-DD format')
    .optional()
    .nullable(),
});

export type CreateMaintenanceRecordDto = z.infer<typeof CreateMaintenanceRecordSchema>;
