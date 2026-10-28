import { z } from 'zod';
import { WitnessStatementSchema } from './create-incident.dto';

export const AddWitnessStatementSchema = z.object({
  reportDetails: z
    .string()
    .min(5, { message: 'Report details must be at least 5 characters' })
    .max(2000),
  witnesses: z
    .array(WitnessStatementSchema)
    .min(1, { message: 'At least one witness statement is required' }),
});

export type AddWitnessStatementDto = z.input<typeof AddWitnessStatementSchema>;
