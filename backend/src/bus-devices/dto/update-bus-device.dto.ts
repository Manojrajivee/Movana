import { z } from 'zod';

export const UpdateBusDeviceSchema = z.object({
  deviceModel: z
    .string()
    .min(1, 'deviceModel cannot be empty')
    .max(50, 'deviceModel must not exceed 50 characters')
    .optional(),
  firmwareVersion: z.string().max(32, 'firmwareVersion must not exceed 32 characters').optional(),
  isActive: z.boolean().optional(),
});

export type UpdateBusDeviceDto = z.infer<typeof UpdateBusDeviceSchema>;
