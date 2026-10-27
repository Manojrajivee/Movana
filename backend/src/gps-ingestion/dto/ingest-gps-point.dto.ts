import { z } from 'zod';

export const IngestGpsPointSchema = z.object({
  deviceImei: z.string().min(5).max(32),
  vehicleId: z.string().uuid().optional(),
  tripId: z.string().uuid().optional(),
  driverId: z.string().uuid().optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracyMeters: z.number().min(0).max(1000).optional(),
  speedKmh: z.number().min(0).max(300).optional(),
  headingDegrees: z.number().min(0).max(360).optional(),
  altitudeMeters: z.number().min(-500).max(10000).optional(),
  odometer: z.number().min(0).optional(),
  recordedAt: z
    .string()
    .datetime()
    .or(z.date())
    .transform((val) => new Date(val)),
  source: z.string().max(32).optional(),
});

export type IngestGpsPointDto = z.infer<typeof IngestGpsPointSchema>;
