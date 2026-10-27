import { z } from 'zod';

export const UpdateProfileSchema = z.object({
  firstName: z
    .string()
    .min(1, 'First name cannot be empty')
    .max(100, 'First name cannot exceed 100 characters')
    .optional(),
  lastName: z
    .string()
    .min(1, 'Last name cannot be empty')
    .max(100, 'Last name cannot exceed 100 characters')
    .optional(),
  phone: z.string().max(32, 'Phone number cannot exceed 32 characters').optional(),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth must be formatted as YYYY-MM-DD')
    .optional(),
  gender: z.string().max(20, 'Gender cannot exceed 20 characters').optional(),
  profileImageUrl: z.string().url('Must be a valid URL').optional(),
  preferredLanguage: z
    .string()
    .max(10, 'Preferred language code cannot exceed 10 characters')
    .optional(),
  preferredCurrency: z
    .string()
    .length(3, 'Preferred currency must be a 3-letter ISO code')
    .optional(),
  accessibilityRequirements: z
    .string()
    .max(1000, 'Accessibility requirements cannot exceed 1000 characters')
    .optional(),
  specialRequirements: z
    .string()
    .max(1000, 'Special requirements cannot exceed 1000 characters')
    .optional(),
  smsEnabled: z.boolean().optional(),
  emailEnabled: z.boolean().optional(),
  pushEnabled: z.boolean().optional(),
  marketingEnabled: z.boolean().optional(),
  tripUpdatesEnabled: z.boolean().optional(),
});

export type UpdateProfileDto = z.infer<typeof UpdateProfileSchema>;
