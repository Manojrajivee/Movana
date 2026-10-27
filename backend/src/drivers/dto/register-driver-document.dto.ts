import { z } from 'zod';

export const RegisterDriverDocumentSchema = z
  .object({
    documentTypeId: z.string().uuid('Document type ID must be a valid UUID'),
    documentNumber: z
      .string()
      .min(1, 'Document number is required')
      .max(100, 'Document number cannot exceed 100 characters')
      .trim(),
    documentUrl: z
      .string()
      .min(5, 'Document URL is required')
      .max(2000, 'Document URL cannot exceed 2000 characters')
      .trim(),
    issuedDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Issued date must be formatted as YYYY-MM-DD')
      .optional(),
    expiryDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expiry date must be formatted as YYYY-MM-DD')
      .optional(),
  })
  .refine(
    (data) => {
      if (data.issuedDate && data.expiryDate) {
        return new Date(data.expiryDate) >= new Date(data.issuedDate);
      }
      return true;
    },
    {
      message: 'Expiry date must be greater than or equal to issued date',
      path: ['expiryDate'],
    },
  );

export type RegisterDriverDocumentDto = z.infer<typeof RegisterDriverDocumentSchema>;
