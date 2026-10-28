import { z } from 'zod';

export const CreateEmergencyContactSchema = z.object({
  name: z.string().min(1, { message: 'Name is required' }).max(100),
  relationship: z.string().min(1, { message: 'Relationship is required' }).max(50),
  phone: z.string().min(7, { message: 'Valid phone number is required' }).max(32),
  email: z.string().email({ message: 'Invalid email address' }).max(255).optional(),
  isPrimary: z.boolean().default(false),
});
export type CreateEmergencyContactDto = z.input<typeof CreateEmergencyContactSchema>;

export const UpdateEmergencyContactSchema = CreateEmergencyContactSchema.partial();
export type UpdateEmergencyContactDto = z.input<typeof UpdateEmergencyContactSchema>;
