import { z } from 'zod';

export const ValidateCouponSchema = z.object({
  couponCode: z.string().trim().min(3).max(50),
  orderAmount: z.coerce.number().min(0).default(0),
});

export type ValidateCouponDto = z.infer<typeof ValidateCouponSchema>;
