import { z } from 'zod';

export const RecordMilestoneSchema = z.object({
  eventType: z
    .string()
    .min(2, 'eventType must be at least 2 characters')
    .max(64, 'eventType must not exceed 64 characters')
    .regex(/^[A-Z0-9_-]+$/, 'eventType must be uppercase alphanumeric with dashes or underscores'),
  eventData: z.record(z.unknown()).optional(),
  stopId: z.string().uuid().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  occurredAt: z.string().datetime().optional(),
});

export type RecordMilestoneDto = z.infer<typeof RecordMilestoneSchema>;
