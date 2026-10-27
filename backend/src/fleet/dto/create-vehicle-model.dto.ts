import { z } from 'zod';

export const CreateVehicleModelSchema = z.object({
  manufacturerId: z.string().uuid('Invalid manufacturer ID format'),
  name: z.string().min(2, 'Model name must be at least 2 characters').max(100).trim(),
  releaseYear: z.number().int().min(1990).max(2050).optional().nullable(),
  defaultCapacity: z.number().int().min(1, 'Default capacity must be at least 1 passenger'),
});

export type CreateVehicleModelDto = z.infer<typeof CreateVehicleModelSchema>;

export const CreateVehicleTypeSchema = z.object({
  code: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[A-Z0-9_]+$/, 'Code must be uppercase alphanumeric with underscores')
    .trim(),
  name: z.string().min(2).max(100).trim(),
  description: z.string().max(500).optional().nullable(),
  defaultFareMultiplier: z.number().min(0.5, 'Multiplier must be at least 0.50').default(1.0),
});

export type CreateVehicleTypeDto = z.infer<typeof CreateVehicleTypeSchema>;
