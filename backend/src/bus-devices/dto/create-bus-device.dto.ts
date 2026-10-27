import { z } from 'zod';

export const CreateBusDeviceSchema = z.object({
  deviceImei: z
    .string()
    .min(8, 'deviceImei must be at least 8 characters')
    .max(32, 'deviceImei must not exceed 32 characters')
    .regex(/^[A-Za-z0-9_-]+$/, 'deviceImei must be alphanumeric'),
  deviceModel: z
    .string()
    .min(1, 'deviceModel is required')
    .max(50, 'deviceModel must not exceed 50 characters'),
  firmwareVersion: z.string().max(32, 'firmwareVersion must not exceed 32 characters').optional(),
  vehicleId: z.string().uuid('vehicleId must be a valid UUID').optional(),
  isActive: z.boolean().optional(),
});

export type CreateBusDeviceDto = z.infer<typeof CreateBusDeviceSchema>;
