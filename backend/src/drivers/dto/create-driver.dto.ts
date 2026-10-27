import { z } from 'zod';

export const CreateDriverSchema = z.object({
  userId: z.string().uuid('User ID must be a valid UUID'),
  employeeCode: z
    .string()
    .min(2, 'Employee code must be at least 2 characters')
    .max(50, 'Employee code cannot exceed 50 characters')
    .trim(),
  licenseNumber: z
    .string()
    .min(5, 'License number must be at least 5 characters')
    .max(50, 'License number cannot exceed 50 characters')
    .trim(),
  licenseCategory: z
    .string()
    .min(2, 'License category is required')
    .max(50, 'License category cannot exceed 50 characters')
    .trim(),
  licenseExpiryDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'License expiry date must be formatted as YYYY-MM-DD'),
  dateOfJoining: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of joining must be formatted as YYYY-MM-DD')
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

export type CreateDriverDto = z.infer<typeof CreateDriverSchema>;
