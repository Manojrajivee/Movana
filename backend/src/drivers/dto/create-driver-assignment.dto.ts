import { z } from 'zod';

export const CreateDriverAssignmentSchema = z
  .object({
    driverId: z.string().uuid('Invalid driver ID format'),
    vehicleId: z.string().uuid('Invalid vehicle ID format').optional().nullable(),
    tripId: z.string().uuid('Invalid trip ID format').optional().nullable(),
    assignmentType: z
      .enum(['REGULAR_SHIFT', 'OVERTIME', 'STANDBY', 'EMERGENCY', 'TRIP'])
      .default('REGULAR_SHIFT'),
    startAt: z
      .string()
      .datetime({ offset: true, message: 'startAt must be a valid ISO-8601 datetime string' }),
    endAt: z
      .string()
      .datetime({ offset: true, message: 'endAt must be a valid ISO-8601 datetime string' })
      .optional()
      .nullable(),
  })
  .refine(
    (data) => {
      if (!data.endAt) return true;
      return new Date(data.endAt) > new Date(data.startAt);
    },
    {
      message: 'Assignment end time must be after start time',
      path: ['endAt'],
    },
  );

export type CreateDriverAssignmentDto = z.infer<typeof CreateDriverAssignmentSchema>;
