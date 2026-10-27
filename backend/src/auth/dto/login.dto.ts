import { z } from 'zod';

export const LoginSchema = z.object({
  email: z
    .string()
    .email('Invalid email address format')
    .max(255)
    .transform((val) => val.trim().toLowerCase()),
  password: z.string().min(1, 'Password is required'),
});

export type LoginDto = z.infer<typeof LoginSchema>;
