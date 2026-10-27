import { z } from 'zod';

export const UpdateVehicleSchema = z
  .object({
    vehicleTypeId: z.string().uuid().optional(),
    seatCapacity: z.number().int().min(1).optional(),
    standingCapacity: z.number().int().min(0).optional(),
    capacity: z.number().int().min(1).optional(),
    fuelType: z.enum(['DIESEL', 'ELECTRIC', 'CNG', 'HYBRID']).optional(),
    currentOdometer: z.number().min(0).optional(),
  })
  .refine(
    (data) => {
      if (
        data.capacity !== undefined &&
        data.seatCapacity !== undefined &&
        data.standingCapacity !== undefined
      ) {
        return data.capacity === data.seatCapacity + data.standingCapacity;
      }
      return true;
    },
    {
      message: 'Vehicle total capacity must equal seat capacity plus standing capacity',
      path: ['capacity'],
    },
  );

export type UpdateVehicleDto = z.infer<typeof UpdateVehicleSchema>;
