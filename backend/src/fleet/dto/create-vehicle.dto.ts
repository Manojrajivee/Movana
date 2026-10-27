import { z } from 'zod';

export const CreateVehicleSchema = z
  .object({
    registrationNumber: z
      .string()
      .min(3, 'Registration number must be at least 3 characters')
      .max(32, 'Registration number must not exceed 32 characters')
      .trim()
      .toUpperCase(),
    vehicleCode: z
      .string()
      .min(2, 'Vehicle code must be at least 2 characters')
      .max(32, 'Vehicle code must not exceed 32 characters')
      .trim()
      .toUpperCase(),
    vehicleTypeId: z.string().uuid('Invalid vehicle type ID format'),
    manufacturerId: z.string().uuid('Invalid manufacturer ID format'),
    modelId: z.string().uuid('Invalid vehicle model ID format'),
    modelYear: z
      .number()
      .int()
      .min(1990, 'Model year must be 1990 or newer')
      .max(new Date().getFullYear() + 2, 'Model year cannot be in the far future'),
    vin: z
      .string()
      .min(5, 'VIN must be at least 5 characters')
      .max(64, 'VIN must not exceed 64 characters')
      .trim()
      .toUpperCase(),
    engineNumber: z
      .string()
      .min(3, 'Engine number must be at least 3 characters')
      .max(64, 'Engine number must not exceed 64 characters')
      .trim(),
    seatCapacity: z.number().int().min(1, 'Seat capacity must be at least 1 seat'),
    standingCapacity: z.number().int().min(0, 'Standing capacity cannot be negative').default(0),
    capacity: z.number().int().min(1).optional(),
    fuelType: z.enum(['DIESEL', 'ELECTRIC', 'CNG', 'HYBRID']).default('DIESEL'),
    currentOdometer: z.number().min(0, 'Odometer cannot be negative').default(0.0),
  })
  .refine(
    (data) => {
      if (data.capacity !== undefined) {
        return data.capacity === data.seatCapacity + (data.standingCapacity ?? 0);
      }
      return true;
    },
    {
      message: 'Vehicle total capacity must equal seat capacity plus standing capacity',
      path: ['capacity'],
    },
  );

export type CreateVehicleDto = z.infer<typeof CreateVehicleSchema>;
