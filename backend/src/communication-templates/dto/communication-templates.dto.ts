import { z } from 'zod';
import { NotificationChannelEnum } from '../../notifications/dto/create-notification.dto';

export const CreateTemplateSchema = z.object({
  templateCode: z
    .string()
    .min(1, { message: 'templateCode is required' })
    .max(100, { message: 'templateCode cannot exceed 100 characters' }),
  channel: NotificationChannelEnum.default('EMAIL'),
  subject: z.string().max(255).optional(),
  bodyTemplate: z.string().min(1, { message: 'bodyTemplate cannot be empty' }),
});
export type CreateTemplateDto = z.input<typeof CreateTemplateSchema>;

export const UpdateTemplateSchema = z.object({
  subject: z.string().max(255).optional(),
  bodyTemplate: z.string().min(1).optional(),
});
export type UpdateTemplateDto = z.input<typeof UpdateTemplateSchema>;

export const RenderTemplateSchema = z.object({
  templateCode: z.string().min(1),
  channel: NotificationChannelEnum,
  variables: z.record(z.any()).default({}),
  locale: z.string().min(2).max(10).optional().default('en'),
});
export type RenderTemplateDto = z.input<typeof RenderTemplateSchema>;

export const QueryTemplatesSchema = z.object({
  channel: NotificationChannelEnum.optional(),
  templateCode: z.string().optional(),
});
export type QueryTemplatesDto = z.input<typeof QueryTemplatesSchema>;
