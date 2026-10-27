import { z } from 'zod';
import { IngestGpsPointSchema } from './ingest-gps-point.dto';

export const BatchIngestGpsSchema = z.object({
  points: z.array(IngestGpsPointSchema).min(1).max(100),
});

export type BatchIngestGpsDto = z.infer<typeof BatchIngestGpsSchema>;
