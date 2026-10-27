import { z } from 'zod';

export const CreateVehicleAssignmentSchema = z
  .object({
    vehicleId: z.string().uuid('Invalid vehicle ID format'),
    driverId: z.string().uuid('Invalid driver ID format'),
    tripId: z.string().uuid('Invalid trip ID format').optional().nullable(),
    assignmentType: z.enum(['TRIP', 'SHIFT', 'STANDBY', 'MAINTENANCE', 'RELIEF']).default('TRIP'),
    startAt: z.string().datetime({
      offset: true,
      message: 'startAt must be a valid ISO 8601 timestamp with timezone',
    }),
    endAt: z
      .string()
      .datetime({ offset: true, message: 'endAt must be a valid ISO 8601 timestamp with timezone' })
      .optional()
      .nullable(),
  })
  .refine(
    (data) => {
      if (data.endAt) {
        return new Date(data.endAt).getTime() > new Date(data.startAt).getTime();
      }
      return true;
    },
    {
      message: 'Assignment end time (endAt) must be after start time (startAt)',
      path: ['endAt'],
    },
  );

export type CreateVehicleAssignmentDto = z.infer<typeof CreateVehicleAssignmentSchema>;
