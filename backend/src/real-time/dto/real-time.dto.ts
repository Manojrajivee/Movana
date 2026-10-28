import { z } from 'zod';

export const RealTimeChannelTypeEnum = z.enum(['vehicle', 'trip', 'route', 'user', 'operations']);
export type RealTimeChannelType = z.infer<typeof RealTimeChannelTypeEnum>;

export const SubscribeChannelSchema = z.object({
  channel: RealTimeChannelTypeEnum,
  targetId: z.string().min(1, { message: 'targetId is required' }).optional(),
});
export type SubscribeChannelDto = z.infer<typeof SubscribeChannelSchema>;

export const PublishEventSchema = z.object({
  room: z.string().min(1, { message: 'Room identifier is required' }),
  event: z.string().min(1, { message: 'Event name is required' }),
  data: z.record(z.any()),
});
export type PublishEventDto = z.infer<typeof PublishEventSchema>;
