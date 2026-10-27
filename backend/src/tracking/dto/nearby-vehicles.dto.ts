import { z } from 'zod';

export const NearbyVehiclesSchema = z.object({
  latitude: z.preprocess((val) => Number(val), z.number().min(-90).max(90)),
  longitude: z.preprocess((val) => Number(val), z.number().min(-180).max(180)),
  radiusKm: z
    .preprocess((val) => (val !== undefined ? Number(val) : 10), z.number().positive().max(100))
    .default(10),
  limit: z
    .preprocess((val) => (val !== undefined ? Number(val) : 20), z.number().int().min(1).max(50))
    .default(20),
});

export type NearbyVehiclesDto = z.infer<typeof NearbyVehiclesSchema>;
