import { z } from 'zod';
import { NotificationChannelEnum } from '../../notifications/dto/create-notification.dto';

export const AlertEventTypeEnum = z.enum([
  'TRIP_DELAY_DETECTED',
  'GEOFENCE_ENTER',
  'GEOFENCE_EXIT',
  'SERVICE_DISRUPTION_BROADCAST',
  'STOP_ARRIVED',
  'STOP_SKIPPED',
  'VEHICLE_SPEED_EXCEEDED',
]);
export type AlertEventType = z.infer<typeof AlertEventTypeEnum>;

export const AlertRuleScopeEnum = z.enum(['PERSONAL', 'SYSTEM']);
export type AlertRuleScope = z.infer<typeof AlertRuleScopeEnum>;

export const AlertConditionsSchema = z.object({
  thresholdMinutes: z.coerce.number().min(1).max(240).optional(),
  routeId: z.string().uuid().optional(),
  tripId: z.string().uuid().optional(),
  stopId: z.string().uuid().optional(),
  geofenceId: z.string().uuid().optional(),
  vehicleId: z.string().uuid().optional(),
  maxSpeedKmh: z.coerce.number().min(10).max(180).optional(),
  severity: z.enum(['INFO', 'WARNING', 'CRITICAL']).optional(),
});
export type AlertConditionsDto = z.infer<typeof AlertConditionsSchema>;

export const CreateAlertRuleSchema = z.object({
  name: z
    .string()
    .min(1, { message: 'Rule name is required' })
    .max(100, { message: 'Rule name cannot exceed 100 characters' }),
  eventType: AlertEventTypeEnum,
  scope: AlertRuleScopeEnum.optional().default('PERSONAL'),
  conditions: AlertConditionsSchema.optional().default({}),
  channels: z.array(NotificationChannelEnum).min(1, {
    message: 'At least one notification channel must be selected',
  }),
  targetUserId: z.string().uuid().optional(),
  isActive: z.boolean().optional().default(true),
  cooldownMinutes: z.coerce.number().min(1).max(1440).optional().default(15),
});

export type CreateAlertRuleDto = z.input<typeof CreateAlertRuleSchema>;
export type CreateAlertRuleOutput = z.output<typeof CreateAlertRuleSchema>;

export const UpdateAlertRuleSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  conditions: AlertConditionsSchema.optional(),
  channels: z.array(NotificationChannelEnum).min(1).optional(),
  isActive: z.boolean().optional(),
  cooldownMinutes: z.coerce.number().min(1).max(1440).optional(),
});

export type UpdateAlertRuleDto = z.input<typeof UpdateAlertRuleSchema>;
export type UpdateAlertRuleOutput = z.output<typeof UpdateAlertRuleSchema>;

export const EvaluateAlertEventSchema = z.object({
  eventType: AlertEventTypeEnum,
  eventPayload: z.object({
    tripId: z.string().uuid().optional(),
    routeId: z.string().uuid().optional(),
    stopId: z.string().uuid().optional(),
    vehicleId: z.string().uuid().optional(),
    geofenceId: z.string().uuid().optional(),
    delayMinutes: z.coerce.number().optional(),
    speedKmh: z.coerce.number().optional(),
    severity: z.string().optional(),
    message: z.string().optional(),
  }),
});

export type EvaluateAlertEventDto = z.input<typeof EvaluateAlertEventSchema>;
export type EvaluateAlertEventOutput = z.output<typeof EvaluateAlertEventSchema>;
