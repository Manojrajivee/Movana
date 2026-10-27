import { z } from 'zod';

export const ForgotPasswordSchema = z.object({
  email: z
    .string()
    .email('Invalid email address format')
    .max(255)
    .transform((val) => val.trim().toLowerCase()),
});

export type ForgotPasswordDto = z.infer<typeof ForgotPasswordSchema>;

export const ResetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters long')
    .max(128)
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one digit')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
});

export type ResetPasswordDto = z.infer<typeof ResetPasswordSchema>;
