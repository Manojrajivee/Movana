import { z } from 'zod';

export const UpdateDriverSchema = z.object({
  licenseCategory: z
    .string()
    .min(2, 'License category is required')
    .max(50, 'License category cannot exceed 50 characters')
    .trim()
    .optional(),
  licenseExpiryDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'License expiry date must be formatted as YYYY-MM-DD')
    .optional(),
  emergencyContact: z
    .object({
      name: z.string().min(1, 'Contact name is required').max(100),
      relationship: z.string().min(1, 'Relationship is required').max(50),
      phone: z.string().min(5, 'Phone number is required').max(32),
      email: z.string().email('Invalid email address').max(255).optional(),
    })
    .optional(),
});

export type UpdateDriverDto = z.infer<typeof UpdateDriverSchema>;
