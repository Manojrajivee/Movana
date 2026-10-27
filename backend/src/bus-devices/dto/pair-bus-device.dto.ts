import { z } from 'zod';

export const PairBusDeviceSchema = z.object({
  vehicleId: z.string().uuid('vehicleId must be a valid UUID'),
});

export type PairBusDeviceDto = z.infer<typeof PairBusDeviceSchema>;
