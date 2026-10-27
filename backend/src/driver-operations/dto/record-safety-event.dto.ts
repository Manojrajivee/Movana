import { z } from 'zod';

export const RecordSafetyEventSchema = z.object({
  driverId: z.string().uuid('Invalid driver ID format'),
  vehicleId: z.string().uuid('Invalid vehicle ID format'),
  tripId: z.string().uuid('Invalid trip ID format').optional().nullable(),
  eventType: z.enum([
    'HARSH_BRAKING',
    'OVERSPEED',
    'RAPID_ACCEL',
    'GEOFENCE_VIOLATION',
    'DROWSINESS',
    'HOURS_EXCEEDED',
  ]),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  speedKmh: z.number().min(0).max(300).optional().nullable(),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  eventData: z.record(z.any()).default({}),
  occurredAt: z
    .string()
    .datetime({ offset: true })
    .default(() => new Date().toISOString()),
});

export type RecordSafetyEventDto = z.infer<typeof RecordSafetyEventSchema>;
