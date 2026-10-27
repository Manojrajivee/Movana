import { z } from 'zod';

export const VerifyDriverDocumentSchema = z
  .object({
    status: z.enum(['VERIFIED', 'REJECTED'], {
      errorMap: () => ({ message: 'Status must be either VERIFIED or REJECTED' }),
    }),
    rejectionReason: z
      .string()
      .max(1000, 'Rejection reason cannot exceed 1000 characters')
      .optional(),
    notes: z.string().max(1000, 'Notes cannot exceed 1000 characters').optional(),
  })
  .refine(
    (data) => {
      if (
        data.status === 'REJECTED' &&
        (!data.rejectionReason || data.rejectionReason.trim().length === 0)
      ) {
        return false;
      }
      return true;
    },
    {
      message: 'Rejection reason is mandatory when document is rejected',
      path: ['rejectionReason'],
    },
  );

export type VerifyDriverDocumentDto = z.infer<typeof VerifyDriverDocumentSchema>;
