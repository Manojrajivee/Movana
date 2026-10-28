import { z } from 'zod';

export const CreateLocationShareSchema = z.object({
  tripId: z.string().uuid({ message: 'Valid tripId UUID is required' }),
  durationMinutes: z
    .number({ invalid_type_error: 'durationMinutes must be a number' })
    .int({ message: 'durationMinutes must be an integer' })
    .min(5, { message: 'Minimum sharing duration is 5 minutes' })
    .max(1440, { message: 'Maximum sharing duration is 1440 minutes (24 hours)' })
    .default(60),
  recipientLabel: z.string().max(100).optional(),
});

export type CreateLocationShareDto = z.input<typeof CreateLocationShareSchema>;

export interface LocationShareSession {
  id: string;
  tripId: string;
  userId: string;
  tokenHash: string;
  recipientLabel?: string;
  createdAt: string;
  expiresAt: string;
  revoked: boolean;
}

export interface CreateLocationShareResponse {
  id: string;
  tripId: string;
  token: string;
  shareUrl: string;
  createdAt: string;
  expiresAt: string;
}

export interface ActiveLocationShareSummary {
  id: string;
  tripId: string;
  recipientLabel?: string;
  createdAt: string;
  expiresAt: string;
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED';
}
