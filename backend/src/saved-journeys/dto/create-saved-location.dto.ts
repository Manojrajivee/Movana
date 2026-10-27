import { z } from 'zod';

export const CreateSavedLocationSchema = z.object({
  addressType: z.enum(['HOME', 'WORK', 'OTHER']).default('OTHER'),
  streetAddress: z.string().trim().min(3).max(255),
  city: z.string().trim().min(2).max(100),
  state: z.string().trim().min(2).max(100),
  postalCode: z.string().trim().min(3).max(20),
  country: z.string().trim().default('India'),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  isDefault: z.boolean().default(false),
});

export type CreateSavedLocationDto = z.infer<typeof CreateSavedLocationSchema>;
