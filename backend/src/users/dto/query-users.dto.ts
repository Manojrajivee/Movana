import { z } from 'zod';

export const QueryUsersSchema = z.object({
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
  status: z.enum(['PENDING', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED']).optional(),
  role: z.string().trim().optional(),
});

export type QueryUsersDto = z.infer<typeof QueryUsersSchema>;
