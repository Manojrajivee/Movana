import { z } from 'zod';

export const QueryDriversSchema = z.object({
  page: z
    .union([z.string(), z.number()])
    .optional()
    .transform((val) => {
      if (val === undefined) return 1;
      const num = typeof val === 'number' ? val : parseInt(val, 10);
      return isNaN(num) || num < 1 ? 1 : num;
    }),
  limit: z
    .union([z.string(), z.number()])
    .optional()
    .transform((val) => {
      if (val === undefined) return 20;
      const num = typeof val === 'number' ? val : parseInt(val, 10);
      if (isNaN(num) || num < 1) return 20;
      return Math.min(100, num);
    }),
  search: z.string().trim().optional(),
  employmentStatus: z.enum(['ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'TERMINATED']).optional(),
  verificationStatus: z.enum(['PENDING', 'VERIFIED', 'REJECTED']).optional(),
});

export type QueryDriversDto = z.infer<typeof QueryDriversSchema>;
