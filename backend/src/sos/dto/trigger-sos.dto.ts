import { z } from 'zod';

export const EmergencyStatusEnum = z.enum(['TRIGGERED', 'DISPATCHED', 'FALSE_ALARM', 'RESOLVED']);
export type EmergencyStatus = z.infer<typeof EmergencyStatusEnum>;

export const EmergencyTypeEnum = z.enum(['SOS_BUTTON', 'MEDICAL', 'SECURITY', 'CRASH', 'OTHER']);
export type EmergencyType = z.infer<typeof EmergencyTypeEnum>;

export const TriggerSosSchema = z.object({
  tripId: z.string().uuid({ message: 'Valid tripId UUID is required' }),
  vehicleId: z.string().uuid({ message: 'Valid vehicleId UUID is required' }),
  driverId: z.string().uuid().optional(),
  emergencyType: EmergencyTypeEnum.default('SOS_BUTTON'),
  latitude: z
    .number()
    .min(-90, { message: 'Latitude must be between -90 and 90' })
    .max(90, { message: 'Latitude must be between -90 and 90' }),
  longitude: z
    .number()
    .min(-180, { message: 'Longitude must be between -180 and 180' })
    .max(180, { message: 'Longitude must be between -180 and 180' }),
  details: z.string().max(500).optional(),
  notifyContacts: z.boolean().default(true),
});
export type TriggerSosDto = z.input<typeof TriggerSosSchema>;

export const UpdateSosStatusSchema = z.object({
  status: z.enum(['DISPATCHED', 'FALSE_ALARM', 'RESOLVED'], {
    message: 'Status must be DISPATCHED, FALSE_ALARM, or RESOLVED',
  }),
  resolutionNotes: z.string().max(500).optional(),
});
export type UpdateSosStatusDto = z.input<typeof UpdateSosStatusSchema>;
